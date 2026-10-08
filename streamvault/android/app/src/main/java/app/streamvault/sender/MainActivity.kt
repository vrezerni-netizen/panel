package app.streamvault.sender

import android.Manifest
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.WindowManager
import android.widget.*
import androidx.core.content.ContextCompat

/** Simple one-screen UI built in code: server, stream name, key, source, mic, orientation, Start/Stop. */
class MainActivity : Activity() {
    private lateinit var prefs: Prefs
    private lateinit var statusView: TextView
    private lateinit var toggle: Button

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) { refresh() }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE) // no screenshots of the key
        prefs = Prefs(this)

        fun field(hint: String, value: String, secret: Boolean = false) = EditText(this).apply {
            this.hint = hint; setText(value); setSingleLine()
            inputType = InputType.TYPE_CLASS_TEXT or
                if (secret) InputType.TYPE_TEXT_VARIATION_PASSWORD else InputType.TYPE_TEXT_VARIATION_URI
        }
        val server = field("Сервер: rtmps://stream.example.com", prefs.server)
        val name = field("Имя эфира (как в админке)", prefs.name)
        val key = field("Ключ эфира", prefs.key, secret = true)
        val screen = RadioButton(this).apply { text = "Экран"; id = 1 }
        val camera = RadioButton(this).apply { text = "Камера"; id = 2 }
        val source = RadioGroup(this).apply {
            orientation = RadioGroup.HORIZONTAL; addView(screen); addView(camera)
            check(if (prefs.source == "camera") 2 else 1)
        }
        val mic = CheckBox(this).apply { text = "Микрофон"; isChecked = prefs.mic }
        val land = CheckBox(this).apply { text = "Горизонтально (экран)"; isChecked = prefs.landscape }
        statusView = TextView(this).apply { textSize = 18f; setPadding(0, 24, 0, 24) }
        toggle = Button(this)

        toggle.setOnClickListener {
            if (StreamService.running) {
                startService(Intent(this, StreamService::class.java).setAction(StreamService.ACTION_STOP))
            } else {
                prefs.server = server.text.toString(); prefs.name = name.text.toString(); prefs.key = key.text.toString()
                prefs.source = if (source.checkedRadioButtonId == 2) "camera" else "screen"
                prefs.mic = mic.isChecked; prefs.landscape = land.isChecked
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
            orientation = LinearLayout.VERTICAL; setPadding(40, 40, 40, 40); setBackgroundColor(0xFF0B1220.toInt())
            val title = TextView(this@MainActivity).apply { text = "Ахмат Запад"; textSize = 26f; setPadding(0, 0, 0, 24); setTextColor(0xFFE3E9F4.toInt()) }
            addView(title)
            listOf(server, name, key, source, mic, land, statusView, toggle).forEach { addView(it) }
        }
        setContentView(ScrollView(this).apply { setBackgroundColor(0xFF0B1220.toInt()); addView(root) })
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
        statusView.text = StreamService.lastStatus
        toggle.text = if (StreamService.running) "Остановить эфир" else "Начать эфир"
    }

    override fun onStart() {
        super.onStart()
        ContextCompat.registerReceiver(this, receiver, IntentFilter(StreamService.ACTION_STATUS), ContextCompat.RECEIVER_NOT_EXPORTED)
        refresh()
    }

    override fun onStop() { unregisterReceiver(receiver); super.onStop() }

    companion object { private const val REQ_PERM = 10; private const val REQ_CAPTURE = 11 }
}
