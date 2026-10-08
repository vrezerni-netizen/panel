package app.streamvault.sender

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.os.PowerManager
import android.provider.MediaStore
import android.util.Base64
import androidx.core.app.NotificationCompat
import com.pedro.common.ConnectChecker
import com.pedro.encoder.input.gl.render.filters.`object`.ImageObjectFilterRender
import com.pedro.encoder.utils.gl.TranslateTo
import com.pedro.library.rtmp.RtmpCamera2
import com.pedro.library.rtmp.RtmpDisplay
import com.pedro.library.view.GlInterface
import com.pedro.library.view.TakePhotoCallback
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Foreground service: Android requires one for screen capture / camera / mic in background. */
class StreamService : Service(), ConnectChecker {
    private var display: RtmpDisplay? = null
    private var camera: RtmpCamera2? = null
    private var wake: PowerManager.WakeLock? = null
    private var wifi: WifiManager.WifiLock? = null
    private var recPfd: ParcelFileDescriptor? = null
    private var recUri: Uri? = null
    private var starting = false
    private val main = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> start(intent)
            ACTION_STOP -> stop()
            ACTION_SHOT -> screenshot()
            ACTION_REC -> toggleRecord()
        }
        return START_NOT_STICKY
    }

    // ---------------------------------------------------------------- start / stop
    private fun start(intent: Intent) {
        if (running || starting) return
        starting = true
        val prefs = Prefs(this)
        val screen = prefs.source == "screen"
        val deviceAudio = screen && prefs.audio == 2 && Build.VERSION.SDK_INT >= 29
        val micOn = prefs.audio == 1 || (prefs.audio == 2 && !deviceAudio)
        startInForeground(screen, micOn)
        wake = (getSystemService(Context.POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "akhmat:stream").apply { setReferenceCounted(false); acquire() }
        wifi = (applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager)
            .createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "akhmat:wifi").apply { setReferenceCounted(false); acquire() }
        status("Подключаюсь…")
        // the title shown on the video comes from the admin panel; ask the server first (off the main thread)
        Thread {
            val ov = fetchOverlay(prefs)
            main.post { if (starting) launch(intent, prefs, screen, micOn, deviceAudio, ov) }
        }.start()
    }

    private data class Overlay(val title: String, val show: Boolean, val pos: String)

    private fun fetchOverlay(prefs: Prefs): Overlay {
        val fallback = Overlay("Ахмат Запад", true, "tr")
        val base = Device.apiBase(prefs.server) ?: return fallback
        val r = Device.post("$base/api/device/overlay", JSONObject().put("name", prefs.name).put("key", prefs.key), 3000) ?: return fallback
        return Overlay(r.optString("title", fallback.title), r.optBoolean("showTitle", true), r.optString("titlePos", "tr"))
    }

    /** Burns the "Ахмат Запад" logo into the picture (corner chosen in the admin panel). Size ~15% of the frame width. */
    private fun applyLogo(gl: GlInterface, ov: Overlay, frameW: Int, frameH: Int) {
        if (!ov.show) return
        val bmp = BitmapFactory.decodeResource(resources, R.drawable.watermark) ?: return
        val f = ImageObjectFilterRender()
        gl.setFilter(f)
        f.setImage(bmp)
        val wPct = 15f
        val hPct = wPct * frameW / frameH // keep the logo round
        f.setScale(wPct, hPct)
        f.setPosition(
            when (ov.pos) {
                "tl" -> TranslateTo.TOP_LEFT
                "bl" -> TranslateTo.BOTTOM_LEFT
                "br" -> TranslateTo.BOTTOM_RIGHT
                else -> TranslateTo.TOP_RIGHT
            },
        )
    }

    private fun launch(intent: Intent, prefs: Prefs, screen: Boolean, micOn: Boolean, deviceAudio: Boolean, ov: Overlay) {
        val url = prefs.publishUrl()
        val ok = if (screen) {
            val code = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
            val data = intent.getParcelableExtra<Intent>(EXTRA_RESULT_DATA)
            if (data == null) false else {
                val d = RtmpDisplay(this, true, this)
                d.setIntentResult(code, data)
                display = d
                d.getStreamClient().setReTries(1000)
                val (w, h) = VideoSpec.screenSize(this, prefs.landscape, prefs.quality)
                val dpi = resources.displayMetrics.densityDpi
                val videoOk = d.prepareVideo(w, h, 30, VideoSpec.bitrate(prefs.quality), 0, dpi)
                val audioOk = when {
                    deviceAudio -> d.prepareInternalAudio(160_000, 44100, true)
                    micOn -> d.prepareAudio(160_000, 44100, true)
                    else -> true
                }
                if (videoOk && audioOk) { applyLogo(d.getGlInterface(), ov, w, h); d.startStream(url); true } else false
            }
        } else {
            val c = RtmpCamera2(this, this)
            camera = c
            c.getStreamClient().setReTries(1000)
            val (cw, ch) = VideoSpec.cameraSize(prefs.quality, true)
            val videoOk = c.prepareVideo(cw, ch, 30, VideoSpec.bitrate(prefs.quality), 2, if (prefs.landscape) 0 else 90)
            val audioOk = if (micOn) c.prepareAudio(160_000, 44100, true) else true
            if (videoOk && audioOk) { applyLogo(c.getGlInterface(), ov, if (prefs.landscape) cw else ch, if (prefs.landscape) ch else cw); c.startStream(url); true } else false
        }
        starting = false
        if (!ok) { status("Не удалось подготовить кодек"); stop() } else { running = true; startedAt = System.currentTimeMillis() }
    }

    private fun stop() {
        starting = false
        if (recording) stopRecordInternal()
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

    // ---------------------------------------------------------------- screenshot (operator button)
    private fun glOrNull(): GlInterface? = display?.getGlInterface() ?: camera?.getGlInterface()

    private fun screenshot() {
        val gl = glOrNull()
        if (!running || gl == null) { note("Сначала начните эфир"); return }
        gl.takePhoto(object : TakePhotoCallback {
            override fun onTakePhoto(bitmap: Bitmap?) {
                if (bitmap == null) { note("Не удалось сделать скриншот"); return }
                Thread { saveScreenshot(bitmap) }.start()
            }
        })
    }

    private fun stamp(fmt: String) = SimpleDateFormat(fmt, Locale.US).format(Date())

    private fun saveScreenshot(bmp: Bitmap) {
        val prefs = Prefs(this)
        val out = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.JPEG, 92, out)
        val bytes = out.toByteArray()
        // 1) the phone gallery: Pictures/Ахмат Запад/<год-месяц-день>/<время>.jpg
        var saved = false
        try {
            val values = ContentValues().apply {
                put(MediaStore.Images.Media.DISPLAY_NAME, "${stamp("HH-mm-ss")}.jpg")
                put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
                if (Build.VERSION.SDK_INT >= 29) put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Ахмат Запад/${stamp("yyyy-MM-dd")}")
            }
            val uri = contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
            if (uri != null) { contentResolver.openOutputStream(uri)?.use { it.write(bytes) }; saved = true }
        } catch (_: Exception) { }
        // 2) the server (admin sees it in "Скриншоты", sorted by date)
        var sent = false
        val base = Device.apiBase(prefs.server)
        if (base != null) {
            val r = Device.post(
                "$base/api/device/screenshot",
                JSONObject().put("name", prefs.name).put("key", prefs.key).put("data", Base64.encodeToString(bytes, Base64.NO_WRAP)),
                15000,
            )
            sent = r != null
        }
        note(
            when {
                saved && sent -> "Скриншот сохранён: телефон и сервер"
                saved -> "Скриншот сохранён на телефон"
                sent -> "Скриншот отправлен на сервер"
                else -> "Не удалось сохранить скриншот"
            },
        )
    }

    // ---------------------------------------------------------------- video recording (operator button)
    private fun toggleRecord() {
        if (!running) { note("Сначала начните эфир"); return }
        if (recording) { stopRecordInternal(); note("Запись сохранена в папку с сегодняшней датой"); return }
        try {
            val name = "${stamp("HH-mm-ss")}.mp4"
            if (Build.VERSION.SDK_INT >= 29) {
                val values = ContentValues().apply {
                    put(MediaStore.Video.Media.DISPLAY_NAME, name)
                    put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
                    put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/Ахмат Запад/${stamp("yyyy-MM-dd")}")
                }
                val uri = contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values) ?: throw IllegalStateException("no uri")
                val pfd = contentResolver.openFileDescriptor(uri, "w") ?: throw IllegalStateException("no fd")
                recUri = uri; recPfd = pfd
                display?.startRecord(pfd.fileDescriptor, null) ?: camera?.startRecord(pfd.fileDescriptor, null)
            } else {
                val dir = File(getExternalFilesDir(Environment.DIRECTORY_MOVIES), "Ахмат Запад/${stamp("yyyy-MM-dd")}")
                dir.mkdirs()
                val path = File(dir, name).absolutePath
                display?.startRecord(path, null) ?: camera?.startRecord(path, null)
            }
            recording = true
            recStartedAt = System.currentTimeMillis()
            note("Идёт запись видео")
        } catch (e: Exception) {
            recording = false
            note("Не удалось начать запись: ${e.message}")
        }
    }

    private fun stopRecordInternal() {
        runCatching { display?.stopRecord() }
        runCatching { camera?.stopRecord() }
        runCatching { recPfd?.close() }
        recPfd = null; recUri = null
        recording = false
    }

    // ---------------------------------------------------------------- notification & status
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

    private fun note(text: String) {
        lastNote = text
        noteAt = System.currentTimeMillis()
        sendBroadcast(Intent(ACTION_STATUS).setPackage(packageName))
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
        const val ACTION_SHOT = "app.streamvault.sender.SHOT"
        const val ACTION_REC = "app.streamvault.sender.REC"
        const val ACTION_STATUS = "app.streamvault.sender.STATUS"
        const val EXTRA_RESULT_CODE = "code"
        const val EXTRA_RESULT_DATA = "data"
        private const val CHANNEL = "stream"
        @Volatile var running = false
        @Volatile var startedAt = 0L
        @Volatile var recording = false
        @Volatile var recStartedAt = 0L
        @Volatile var lastStatus = "Готов"
        @Volatile var lastNote = ""
        @Volatile var noteAt = 0L
    }
}
