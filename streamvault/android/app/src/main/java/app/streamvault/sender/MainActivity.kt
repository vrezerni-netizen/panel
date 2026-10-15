package app.streamvault.sender

import android.Manifest
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat

/**
 * Sender screen, "Ахмат Запад" style (same colors as the admin panel):
 *  control card (timer, status, round Record / Stop buttons) -> big source tiles -> video size -> sound -> connection.
 */
class MainActivity : Activity() {
    private lateinit var prefs: Prefs
    private lateinit var statusText: TextView
    private lateinit var statusDot: View
    private lateinit var timerText: TextView
    private lateinit var recBtn: TextView
    private lateinit var stopBtn: TextView
    private lateinit var sizeInfo: TextView
    private lateinit var shotBtn: TextView
    private lateinit var vidBtn: TextView
    private lateinit var noteText: TextView
    private lateinit var tileScreen: LinearLayout
    private lateinit var tileCamera: LinearLayout
    private lateinit var land: Switch
    private val handler = Handler(Looper.getMainLooper())
    private val tick = object : Runnable {
        override fun run() { refresh(); handler.postDelayed(this, 1000) }
    }
    private var source = "screen"
    private var quality = 1
    private var audio = 1

    private val cBg1 = 0xFF0B1220.toInt()
    private val cBg2 = 0xFF132042.toInt()
    private val cCard = 0xFF16223A.toInt()
    private val cTile = 0xFF1B2A46.toInt()
    private val cField = 0xFF0E1628.toInt()
    private val cLine = 0xFF26365A.toInt()
    private val cText = 0xFFE6EBF6.toInt()
    private val cMuted = 0xFF8C9BB8.toInt()
    private val cAccent = 0xFF3B82F6.toInt()
    private val cRed = 0xFFE11D48.toInt()
    private val cGreen = 0xFF34D399.toInt()
    private val cAmber = 0xFFFBBF24.toInt()

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) { refresh() }
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun round(color: Int, radius: Int, stroke: Int = 0, strokeColor: Int = 0) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(radius).toFloat()
        if (stroke > 0) setStroke(dp(stroke), strokeColor)
    }

    private fun circle(color: Int, stroke: Int = 0, strokeColor: Int = 0) = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(color)
        if (stroke > 0) setStroke(dp(stroke), strokeColor)
    }

    private fun lp(top: Int = 0) = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = dp(top) }

    private fun card(vararg views: View) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = round(cCard, 18, 1, cLine)
        setPadding(dp(16), dp(14), dp(16), dp(16))
        views.forEach { addView(it) }
    }

    private fun title(text: String) = TextView(this).apply {
        this.text = text
        setTextColor(cText)
        textSize = 16f
        typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
        setPadding(dp(2), 0, 0, dp(10))
    }

    private fun label(text: String) = TextView(this).apply {
        this.text = text
        setTextColor(cMuted)
        textSize = 12f
        letterSpacing = 0.06f
        setPadding(dp(2), dp(12), 0, dp(6))
    }

    private fun field(hint: String, value: String, secret: Boolean = false) = EditText(this).apply {
        this.hint = hint
        setText(value)
        setSingleLine()
        textSize = 16f
        setTextColor(cText)
        setHintTextColor(cMuted)
        background = round(cField, 12, 1, cLine)
        setPadding(dp(14), dp(13), dp(14), dp(13))
        inputType = InputType.TYPE_CLASS_TEXT or
            (if (secret) InputType.TYPE_TEXT_VARIATION_PASSWORD else InputType.TYPE_TEXT_VARIATION_URI)
    }

    private fun segmented(labels: List<String>, selected: Int, onSelect: (Int) -> Unit): LinearLayout {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            background = round(cField, 12, 1, cLine)
            setPadding(dp(4), dp(4), dp(4), dp(4))
        }
        val views = mutableListOf<TextView>()
        fun paint(sel: Int) {
            views.forEachIndexed { i, v ->
                v.background = if (i == sel) round(cAccent, 9) else null
                v.setTextColor(if (i == sel) Color.WHITE else cMuted)
            }
        }
        labels.forEachIndexed { i, l ->
            val tv = TextView(this).apply {
                text = l
                gravity = Gravity.CENTER
                textSize = 15f
                typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
                setPadding(0, dp(11), 0, dp(11))
                layoutParams = LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f)
                setOnClickListener { paint(i); onSelect(i) }
            }
            views += tv
            box.addView(tv)
        }
        paint(selected)
        return box
    }

    /** Big square tile with an icon and a caption, like the "Полный экран" tiles in screen recorders. */
    private fun tile(iconRes: Int, caption: String): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setPadding(dp(8), dp(18), dp(8), dp(16))
        layoutParams = LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f).apply { setMargins(dp(5), 0, dp(5), 0) }
        addView(ImageView(context).apply {
            setImageResource(iconRes)
            setColorFilter(cText)
            layoutParams = LinearLayout.LayoutParams(dp(54), dp(54))
        })
        addView(TextView(context).apply {
            text = caption
            setTextColor(cText)
            textSize = 15f
            gravity = Gravity.CENTER
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            setPadding(0, dp(10), 0, 0)
        })
    }

    private fun paintTiles() {
        val sel = round(0xFF1E3A6E.toInt(), 16, 2, cAccent)
        val off = round(cTile, 16, 1, cLine)
        tileScreen.background = if (source == "screen") sel else off
        tileCamera.background = if (source == "camera") sel else off
    }

    private fun roundButton(symbol: String, size: Int): TextView = TextView(this).apply {
        text = symbol
        gravity = Gravity.CENTER
        textSize = 30f
        layoutParams = LinearLayout.LayoutParams(dp(size), dp(size)).apply { leftMargin = dp(12) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // no screenshots of the stream key; keep the screen on while the app is open
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.statusBarColor = cBg1
        window.navigationBarColor = cBg1
        prefs = Prefs(this)
        source = prefs.source
        quality = prefs.quality.coerceIn(0, 2)
        audio = prefs.audio.coerceIn(0, 2)

        // ---- header ----
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(ImageView(context).apply {
                setImageResource(R.drawable.emblem)
                layoutParams = LinearLayout.LayoutParams(dp(52), dp(52))
            })
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(14), 0, 0, 0)
                addView(TextView(context).apply {
                    text = "Ахмат Запад"
                    textSize = 24f
                    setTextColor(cText)
                    typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
                })
                addView(TextView(context).apply { text = "Запись и эфир экрана"; textSize = 13f; setTextColor(cMuted) })
            })
        }

        // ---- control card: timer + status on the left, round Record / Stop on the right ----
        statusDot = View(this).apply {
            background = circle(cMuted)
            layoutParams = LinearLayout.LayoutParams(dp(11), dp(11)).apply { rightMargin = dp(8) }
        }
        statusText = TextView(this).apply { textSize = 15f; setTextColor(cText) }
        timerText = TextView(this).apply {
            textSize = 38f
            typeface = Typeface.create("sans-serif-light", Typeface.NORMAL)
        }
        val left = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f)
            addView(timerText)
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, dp(4), 0, 0)
                addView(statusDot); addView(statusText)
            })
        }
        recBtn = roundButton("●", 68)
        stopBtn = roundButton("■", 56)
        val controls = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(left); addView(recBtn); addView(stopBtn)
        }
        // operator tools while live: own screenshot and own video recording (saved on the phone by date)
        fun toolButton(text: String) = TextView(this).apply {
            this.text = text
            gravity = Gravity.CENTER
            textSize = 15f
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            setPadding(dp(8), dp(13), dp(8), dp(13))
            layoutParams = LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f).apply { setMargins(dp(4), 0, dp(4), 0) }
        }
        shotBtn = toolButton("📷  Скриншот")
        vidBtn = toolButton("🎬  Записать видео")
        shotBtn.setOnClickListener { startService(Intent(this, StreamService::class.java).setAction(StreamService.ACTION_SHOT)) }
        vidBtn.setOnClickListener { startService(Intent(this, StreamService::class.java).setAction(StreamService.ACTION_REC)) }
        noteText = TextView(this).apply { textSize = 13f; setTextColor(cMuted); setPadding(dp(4), dp(8), 0, 0) }
        val tools = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, dp(14), 0, 0)
            addView(shotBtn); addView(vidBtn)
        }
        val controlCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = round(cCard, 18, 1, cLine)
            setPadding(dp(18), dp(16), dp(16), dp(16))
            addView(controls); addView(tools); addView(noteText)
        }

        // ---- what to record: big tiles ----
        tileScreen = tile(R.drawable.ic_screen, "Полный экран")
        tileCamera = tile(R.drawable.ic_camera, "Камера")
        tileScreen.setOnClickListener { source = "screen"; paintTiles(); updateSizeInfo() }
        tileCamera.setOnClickListener { source = "camera"; paintTiles(); updateSizeInfo() }
        val tiles = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(tileScreen); addView(tileCamera)
        }
        paintTiles()

        // ---- size, sound, orientation ----
        sizeInfo = TextView(this).apply { textSize = 14f; setTextColor(cMuted); setPadding(dp(2), dp(8), 0, 0) }
        val qualitySeg = segmented(listOf("720p", "1080p", "1080p+"), quality) { quality = it; updateSizeInfo() }
        val audioSeg = segmented(listOf("Без звука", "Микрофон", "Звук устройства"), audio) { audio = it }
        land = Switch(this).apply {
            text = "Горизонтальное видео"
            isChecked = prefs.landscape
            textSize = 16f
            setTextColor(cText)
            setPadding(0, dp(14), 0, dp(2))
            thumbTintList = ColorStateList(arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()), intArrayOf(cAccent, cMuted))
            trackTintList = ColorStateList(arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()), intArrayOf(0x663B82F6, 0x4426365A))
            setOnCheckedChangeListener { _, _ -> updateSizeInfo() }
        }
        val options = card(
            title("Как записывать"), tiles,
            label("РАЗМЕР ВИДЕО"), qualitySeg, sizeInfo,
            label("ЗВУК"), audioSeg, land,
        )

        // ---- connection ----
        val server = field("rtmp://192.168.0.72", prefs.server)
        val name = field("tablet1", prefs.name)
        val key = field("Ключ из админки", prefs.key, secret = true)
        val conn = card(title("Подключение"), label("СЕРВЕР"), server, label("ИМЯ ЭФИРА"), name, label("КЛЮЧ ЭФИРА"), key)

        fun begin() {
            prefs.server = server.text.toString(); prefs.name = name.text.toString(); prefs.key = key.text.toString()
            prefs.source = source; prefs.quality = quality; prefs.audio = audio; prefs.landscape = land.isChecked
            if (prefs.server.isEmpty() || prefs.name.isEmpty() || prefs.key.isEmpty()) {
                Toast.makeText(this, "Заполните сервер, имя и ключ", Toast.LENGTH_LONG).show(); return
            }
            val lan = Regex("^rtmp://(127\\.|10\\.|192\\.168\\.|172\\.(1[6-9]|2[0-9]|3[01])\\.)")
            if (!prefs.server.startsWith("rtmps://") && !lan.containsMatchIn(prefs.server)) {
                Toast.makeText(this, "Используйте rtmps:// (шифрование)", Toast.LENGTH_LONG).show(); return
            }
            requestedOrientation = if (prefs.landscape) ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE else ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            requestPermissionsThenStart()
        }
        recBtn.setOnClickListener { if (!StreamService.running) begin() }
        stopBtn.setOnClickListener {
            if (StreamService.running) startService(Intent(this, StreamService::class.java).setAction(StreamService.ACTION_STOP))
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(20), dp(16), dp(28))
            addView(header, lp())
            addView(controlCard, lp(16))
            addView(options, lp(14))
            addView(conn, lp(14))
        }
        setContentView(ScrollView(this).apply {
            isFillViewport = true
            background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(cBg2, cBg1))
            addView(root)
        })
        updateSizeInfo()
    }

    private fun updateSizeInfo() {
        val landscape = land.isChecked
        val (w, h) = if (source == "camera") VideoSpec.cameraSize(quality, landscape) else VideoSpec.screenSize(this, landscape, quality)
        sizeInfo.text = "$w × $h  ·  ${VideoSpec.bitrate(quality) / 1_000_000} Мбит/с"
    }

    private fun requestPermissionsThenStart() {
        val need = mutableListOf<String>()
        if (prefs.audio != 0) need += Manifest.permission.RECORD_AUDIO
        if (prefs.source == "camera") need += Manifest.permission.CAMERA
        if (Build.VERSION.SDK_INT >= 33) need += Manifest.permission.POST_NOTIFICATIONS
        val missing = need.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) requestPermissions(missing.toTypedArray(), REQ_PERM) else startCapture()
    }

    override fun onRequestPermissionsResult(code: Int, perms: Array<out String>, results: IntArray) {
        if (code == REQ_PERM) startCapture()
    }

    private fun startCapture() {
        if (prefs.source == "screen") {
            val mpm = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            startActivityForResult(mpm.createScreenCaptureIntent(), REQ_CAPTURE)
        } else {
            ContextCompat.startForegroundService(this, Intent(this, StreamService::class.java).setAction(StreamService.ACTION_START))
        }
    }

    @Deprecated("simple flow")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQ_CAPTURE && resultCode == RESULT_OK && data != null) {
            ContextCompat.startForegroundService(
                this,
                Intent(this, StreamService::class.java).setAction(StreamService.ACTION_START)
                    .putExtra(StreamService.EXTRA_RESULT_CODE, resultCode)
                    .putExtra(StreamService.EXTRA_RESULT_DATA, data),
            )
        }
    }

    private fun refresh() {
        val st = StreamService.lastStatus
        statusText.text = st
        val color = when {
            st.startsWith("В эфире") -> cGreen
            st.contains("переподключ") || st.contains("потеряна") -> cAmber
            st.contains("Ошибка") || st.contains("Неверный") || st.contains("Не удалось") -> cRed
            else -> cMuted
        }
        (statusDot.background as GradientDrawable).setColor(color)
        val on = StreamService.running
        if (on) {
            val s = ((System.currentTimeMillis() - StreamService.startedAt) / 1000).coerceAtLeast(0)
            timerText.text = String.format("%02d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
        } else timerText.text = "00:00:00"
        timerText.setTextColor(if (on) cText else cMuted)
        // round buttons: red record (dimmed while live), gray stop (active while live)
        recBtn.text = "●"
        recBtn.setTextColor(if (on) 0x88E11D48.toInt() else cRed)
        recBtn.background = circle(cTile, 2, if (on) cLine else cRed)
        stopBtn.text = "■"
        stopBtn.setTextColor(if (on) cText else cMuted)
        stopBtn.background = circle(cTile, 2, if (on) cMuted else cLine)
        // operator tools: active only while live
        val rec = StreamService.recording
        shotBtn.alpha = if (on) 1f else 0.4f
        vidBtn.alpha = if (on) 1f else 0.4f
        shotBtn.setTextColor(cText); shotBtn.background = round(cTile, 12, 1, cLine)
        if (rec) {
            val rs = ((System.currentTimeMillis() - StreamService.recStartedAt) / 1000).coerceAtLeast(0)
            vidBtn.text = String.format("⏹  Стоп  %02d:%02d", rs / 60, rs % 60)
            vidBtn.setTextColor(Color.WHITE); vidBtn.background = round(cRed, 12)
        } else {
            vidBtn.text = "🎬  Записать видео"
            vidBtn.setTextColor(cText); vidBtn.background = round(cTile, 12, 1, cLine)
        }
        val fresh = System.currentTimeMillis() - StreamService.noteAt < 6000 && StreamService.lastNote.isNotEmpty()
        noteText.text = if (fresh) StreamService.lastNote else ""
        noteText.visibility = if (fresh) View.VISIBLE else View.GONE
    }

    override fun onStart() {
        super.onStart()
        ContextCompat.registerReceiver(this, receiver, IntentFilter(StreamService.ACTION_STATUS), ContextCompat.RECEIVER_NOT_EXPORTED)
        handler.post(tick)
    }

    override fun onStop() {
        handler.removeCallbacks(tick)
        unregisterReceiver(receiver)
        super.onStop()
    }

    companion object { private const val REQ_PERM = 10; private const val REQ_CAPTURE = 11 }
}
