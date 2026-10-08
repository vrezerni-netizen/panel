package app.streamvault.sender

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.net.wifi.WifiManager
import android.graphics.Rect
import android.os.IBinder
import android.os.PowerManager
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import com.pedro.common.ConnectChecker
import com.pedro.library.rtmp.RtmpCamera2
import com.pedro.library.rtmp.RtmpDisplay

/** Foreground service: Android requires one for screen capture / camera / mic in background. */
class StreamService : Service(), ConnectChecker {
    private var display: RtmpDisplay? = null
    private var camera: RtmpCamera2? = null
    private var wake: PowerManager.WakeLock? = null
    private var wifi: WifiManager.WifiLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> start(intent)
            ACTION_STOP -> stop()
        }
        return START_NOT_STICKY
    }

    private fun start(intent: Intent) {
        if (running) return
        val prefs = Prefs(this)
        val screen = prefs.source == "screen"
        val micOn = prefs.mic
        startInForeground(screen, micOn)
        wake = (getSystemService(Context.POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "akhmat:stream").apply { setReferenceCounted(false); acquire() }
        wifi = (applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager)
            .createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "akhmat:wifi").apply { setReferenceCounted(false); acquire() }

        val url = prefs.publishUrl()
        val ok = if (screen) {
            val code = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
            val data = intent.getParcelableExtra<Intent>(EXTRA_RESULT_DATA)
            if (data == null) false else {
                val d = RtmpDisplay(this, true, this)
                d.setIntentResult(code, data)
                display = d
                d.getStreamClient().setReTries(1000)
                val (w, h) = screenSize(prefs.landscape, qualityLong(prefs.quality))
                val dpi = resources.displayMetrics.densityDpi
                val videoOk = d.prepareVideo(w, h, 30, qualityBitrate(prefs.quality), 0, dpi)
                val audioOk = if (micOn) d.prepareAudio(160_000, 44100, true) else true
                if (videoOk && audioOk) { d.startStream(url); true } else false
            }
        } else {
            val c = RtmpCamera2(this, this)
            camera = c
            c.getStreamClient().setReTries(1000)
            val videoOk = c.prepareVideo(qualityLong(prefs.quality), if (prefs.quality == 0) 720 else 1080, 30, qualityBitrate(prefs.quality), 2, if (prefs.landscape) 0 else 90)
            val audioOk = if (micOn) c.prepareAudio(160_000, 44100, true) else true
            if (videoOk && audioOk) { c.startStream(url); true } else false
        }
        if (!ok) { status("Не удалось подготовить кодек"); stop() } else running = true
    }

    private fun stop() {
        display?.takeIf { it.isStreaming }?.stopStream()
        camera?.takeIf { it.isStreaming }?.stopStream()
        display = null
        camera = null
        running = false
        runCatching { if (wake?.isHeld == true) wake?.release() }
        runCatching { if (wifi?.isHeld == true) wifi?.release() }
        status("Остановлено")
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    // Real screen shape (4:3, 16:10, 16:9 ...) scaled to the chosen quality, so the picture is not stretched.
    private fun screenSize(landscape: Boolean, longSide: Int): Pair<Int, Int> {
        val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val bounds: Rect = if (Build.VERSION.SDK_INT >= 30) wm.maximumWindowMetrics.bounds else {
            val m = android.util.DisplayMetrics()
            @Suppress("DEPRECATION") wm.defaultDisplay.getRealMetrics(m)
            Rect(0, 0, m.widthPixels, m.heightPixels)
        }
        val a = maxOf(bounds.width(), bounds.height()).toFloat()
        val b = minOf(bounds.width(), bounds.height()).toFloat()
        val long = longSide
        val short = ((long * b / a).toInt() / 2) * 2 // even number for the encoder
        return if (landscape) long to short else short to long
    }

    private fun qualityLong(q: Int) = if (q == 0) 1280 else 1920
    private fun qualityBitrate(q: Int) = when (q) { 0 -> 3_000_000; 1 -> 8_000_000; else -> 12_000_000 }

    private fun startInForeground(screen: Boolean, mic: Boolean) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Эфир", NotificationManager.IMPORTANCE_LOW))
        val n: Notification = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setContentTitle("Ахмат Запад — идёт эфир")
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 29) {
            var type = if (screen) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION else ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
            if (mic) type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            startForeground(1, n, type)
        } else startForeground(1, n)
    }

    private fun status(text: String) {
        lastStatus = text
        sendBroadcast(Intent(ACTION_STATUS).setPackage(packageName).putExtra("text", text))
    }

    // ---- ConnectChecker ----
    override fun onConnectionStarted(url: String) {}
    override fun onConnectionSuccess() = status("В эфире")
    override fun onConnectionFailed(reason: String) {
        val client = display?.getStreamClient() ?: camera?.getStreamClient()
        if (running && client != null && client.reTry(5000, reason, null)) {
            status("Связь потеряна, переподключаюсь...")
        } else { status("Ошибка связи: $reason"); stop() }
    }
    override fun onNewBitrate(bitrate: Long) {}
    override fun onDisconnect() = status("Отключено")
    override fun onAuthError() { status("Неверный ключ эфира"); stop() }
    override fun onAuthSuccess() {}

    override fun onDestroy() { stop(); super.onDestroy() }

    companion object {
        const val ACTION_START = "app.streamvault.sender.START"
        const val ACTION_STOP = "app.streamvault.sender.STOP"
        const val ACTION_STATUS = "app.streamvault.sender.STATUS"
        const val EXTRA_RESULT_CODE = "code"
        const val EXTRA_RESULT_DATA = "data"
        private const val CHANNEL = "stream"
        @Volatile var running = false
        @Volatile var lastStatus = "Готов"
    }
}
