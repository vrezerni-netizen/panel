package app.streamvault.sender

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.pedro.common.ConnectChecker
import com.pedro.library.rtmp.RtmpCamera2
import com.pedro.library.rtmp.RtmpDisplay

/** Foreground service: Android requires one for screen capture / camera / mic in background. */
class StreamService : Service(), ConnectChecker {
    private var display: RtmpDisplay? = null
    private var camera: RtmpCamera2? = null

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

        val url = prefs.publishUrl()
        val ok = if (screen) {
            val code = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
            val data = intent.getParcelableExtra<Intent>(EXTRA_RESULT_DATA)
            if (data == null) false else {
                val d = RtmpDisplay(this, true, this)
                d.setIntentResult(code, data)
                display = d
                val (w, h) = screenSize(prefs.landscape)
                val dpi = resources.displayMetrics.densityDpi
                val videoOk = d.prepareVideo(w, h, 30, 3_000_000, 0, dpi)
                val audioOk = if (micOn) d.prepareAudio(128_000, 44100, true) else true
                if (videoOk && audioOk) { d.startStream(url); true } else false
            }
        } else {
            val c = RtmpCamera2(this, this)
            camera = c
            val videoOk = c.prepareVideo(1280, 720, 30, 2_500_000)
            val audioOk = if (micOn) c.prepareAudio(128_000, 44100, true) else true
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
        status("Остановлено")
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    // 16:9 at 720p; orientation chosen in the app (set before starting).
    private fun screenSize(landscape: Boolean): Pair<Int, Int> {
        val long = 1280
        val short = 720
        return if (landscape) long to short else short to long
    }

    private fun startInForeground(screen: Boolean, mic: Boolean) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Эфир", NotificationManager.IMPORTANCE_LOW))
        val n: Notification = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setContentTitle("Идёт эфир")
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
    override fun onConnectionFailed(reason: String) { status("Ошибка связи: $reason"); stop() }
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
