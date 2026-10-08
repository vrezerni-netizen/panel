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

/** Sender screen in the "Ахмат Запад" dark blue-gray style: emblem, status + timer, settings card, big Start/Stop button. */
class MainActivity : Activity() {
    private lateinit var prefs: Prefs
    private lateinit var statusText: TextView
    private lateinit var statusDot: View
    private lateinit var timerText: TextView
    private lateinit var toggle: Button
    private val handler = Handler(Looper.getMainLooper())
    private val tick = object : Runnable {
        override fun run() { refresh(); handler.postDelayed(this, 1000) }
    }
    private var source = "screen"
    private var quality = 1

    private val cBg1 = 0xFF0B1220.toInt()
    private val cBg2 = 0xFF132042.toInt()
    private val cCard = 0xFF16223A.toInt()
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

    private fun lp(top: Int = 0) = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = dp(top) }

    private fun card(vararg children: View) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = round(cCard, 18, 1, cLine)
        setPadding(dp(16), dp(16), dp(16), dp(16))
        children.forEach { addView(it) }
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

    private fun toggleRow(text: String, checked: Boolean) = Switch(this).apply {
        this.text = text
        isChecked = checked
        textSize = 16f
        setTextColor(cText)
        setPadding(0, dp(10), 0, dp(10))
        thumbTintList = ColorStateList(
            arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()),
            intArrayOf(cAccent, 0xFF8C9BB8.toInt()),
        )
        trackTintList = ColorStateList(
            arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()),
            intArrayOf(0x663B82F6, 0x4426365A),
        )
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

        // ---- header ----
        val emblem = ImageView(this).apply {
            setImageResource(R.drawable.emblem)
            layoutParams = LinearLayout.LayoutParams(dp(56), dp(56))
        }
        val titles = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), 0, 0, 0)
            addView(TextView(context).apply {
                text = "Ахмат Запад"
                textSize = 26f
                setTextColor(cText)
                typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
            })
            addView(TextView(context).apply { text = "Передатчик эфира"; textSize = 14f; setTextColor(cMuted) })
        }
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(emblem); addView(titles)
        }

        // ---- status card (dot + text + elapsed timer) ----
        statusDot = View(this).apply {
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(cMuted) }
            layoutParams = LinearLayout.LayoutParams(dp(12), dp(12)).apply { rightMargin = dp(10) }
        }
        statusText = TextView(this).apply { textSize = 17f; setTextColor(cText) }
        val statusRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(statusDot); addView(statusText)
        }
        timerText = TextView(this).apply {
            textSize = 40f
            setTextColor(cText)
            typeface = Typeface.create("sans-serif-light", Typeface.NORMAL)
            setPadding(0, dp(6), 0, 0)
        }
        val statusCard = card(statusRow, timerText)

        // ---- settings card ----
        val server = field("rtmp://192.168.0.72", prefs.server)
        val name = field("tablet1", prefs.name)
        val key = field("Ключ из админки", prefs.key, secret = true)
        val sourceSeg = segmented(listOf("Экран", "Камера"), if (source == "camera") 1 else 0) { source = if (it == 1) "camera" else "screen" }
        val qualitySeg = segmented(listOf("720p", "1080p", "1080p+"), quality) { quality = it }
        val mic = toggleRow("Микрофон", prefs.mic)
        val land = toggleRow("Горизонтально", prefs.landscape)
        val settings = card(
            label("СЕРВЕР"), server, label("ИМЯ ЭФИРА"), name, label("КЛЮЧ ЭФИРА"), key,
            label("ИСТОЧНИК"), sourceSeg, label("КАЧЕСТВО"), qualitySeg,
            mic, land,
        )

        // ---- start / stop ----
        toggle = Button(this).apply {
            textSize = 18f
            isAllCaps = false
            setTextColor(Color.WHITE)
            typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
            stateListAnimator = null
        }
        toggle.setOnClickListener {
            if (StreamService.running) {
                startService(Intent(this, StreamService::class.java).setAction(StreamService.ACTION_STOP))
            } else {
                prefs.server = server.text.toString(); prefs.name = name.text.toString(); prefs.key = key.text.toString()
                prefs.source = source; prefs.quality = quality; prefs.mic = mic.isChecked; prefs.landscape = land.isChecked
                if (prefs.server.isEmpty() || prefs.name.isEmpty() || prefs.key.isEmpty()) {
                    Toast.makeText(this, "Заполните сервер, имя и ключ", Toast.LENGTH_LONG).show(); return@setOnClickListener
                }
                val lan = Regex("^rtmp://(127\\.|10\\.|192\\.168\\.|172\\.(1[6-9]|2[0-9]|3[01])\\.)")
                if (!prefs.server.startsWith("rtmps://") && !lan.containsMatchIn(prefs.server)) {
                    Toast.makeText(this, "Используйте rtmps:// (шифрование)", Toast.LENGTH_LONG).show(); return@setOnClickListener
                }
                requestedOrientation = if (prefs.landscape) ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE else ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                requestPermissionsThenStart()
            }
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(22), dp(18), dp(28))
            addView(header, lp())
            addView(statusCard, lp(20))
            addView(settings, lp(14))
            addView(toggle, LinearLayout.LayoutParams(MATCH_PARENT, dp(58)).apply { topMargin = dp(18) })
        }
        setContentView(ScrollView(this).apply {
            isFillViewport = true
            background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(cBg2, cBg1))
            addView(root)
        })
    }

    private fun requestPermissionsThenStart() {
        val need = mutableListOf<String>()
        if (prefs.mic) need += Manifest.permission.RECORD_AUDIO
        if (prefs.source == "camera") need += Manifest.permission.CAMERA
        if (Build.VERSION.SDK_INT >= 33) need += Manifest.permission.POST_NOTIFICATIONS
        val missing = need.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) requestPermissions(missing.toTypedArray(), REQ_PERM) else begin()
    }

    override fun onRequestPermissionsResult(code: Int, perms: Array<out String>, results: IntArray) {
        if (code == REQ_PERM) begin()
    }

    private fun begin() {
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
        if (StreamService.running) {
            val s = ((System.currentTimeMillis() - StreamService.startedAt) / 1000).coerceAtLeast(0)
            timerText.text = String.format("%02d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
            timerText.setTextColor(cText)
            toggle.text = "Остановить эфир"
            toggle.background = round(cRed, 16)
        } else {
            timerText.text = "00:00:00"
            timerText.setTextColor(cMuted)
            toggle.text = "Начать эфир"
            toggle.background = round(cAccent, 16)
        }
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
