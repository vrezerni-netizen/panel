package app.streamvault.sender

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** Settings stored encrypted (Android Keystore). The stream key never lies in plain text on disk. */
class Prefs(context: Context) {
    private val sp: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "sv_prefs",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    var server: String
        get() = sp.getString("server", "") ?: ""
        set(v) = sp.edit().putString("server", v.trim()).apply()
    var name: String
        get() = sp.getString("name", "") ?: ""
        set(v) = sp.edit().putString("name", v.trim()).apply()
    var key: String
        get() = sp.getString("key", "") ?: ""
        set(v) = sp.edit().putString("key", v.trim()).apply()
    var source: String // "screen" | "camera"
        get() = sp.getString("source", "screen") ?: "screen"
        set(v) = sp.edit().putString("source", v).apply()
    var mic: Boolean
        get() = sp.getBoolean("mic", true)
        set(v) = sp.edit().putBoolean("mic", v).apply()
    var landscape: Boolean
        get() = sp.getBoolean("landscape", true)
        set(v) = sp.edit().putBoolean("landscape", v).apply()

    /** server: "rtmps://host" (or rtmp:// for a local test), name/key from the admin panel. */
    fun publishUrl(): String {
        val base = server.trimEnd('/')
        return "$base/live/$name?user=pub&pass=$key"
    }
}
