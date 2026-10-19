package app.streamvault.sender

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Talks to the server API with the stream name + key (same secret as for publishing). */
object Device {
    private val lan = Regex("^(127\\.|10\\.|192\\.168\\.|172\\.(1[6-9]|2[0-9]|3[01])\\.)")

    /** rtmp://192.168.0.72 -> http://192.168.0.72:3000 (home network only); rtmps://host -> https://host. */
    fun apiBase(server: String): String? {
        val m = Regex("^(rtmps?)://([^/:]+)").find(server.trim()) ?: return null
        val scheme = m.groupValues[1]
        val host = m.groupValues[2]
        return when {
            scheme == "rtmps" -> "https://$host"
            lan.containsMatchIn(host) -> "http://$host:3000"
            else -> null
        }
    }

    /** Blocking call: use from a background thread. Returns parsed JSON or null on any failure. */
    fun post(url: String, body: JSONObject, timeoutMs: Int = 8000): JSONObject? {
        return try {
            val c = URL(url).openConnection() as HttpURLConnection
            c.requestMethod = "POST"
            c.connectTimeout = timeoutMs
            c.readTimeout = timeoutMs
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            c.outputStream.use { it.write(body.toString().toByteArray()) }
            if (c.responseCode !in 200..299) null else JSONObject(c.inputStream.bufferedReader().readText())
        } catch (e: Exception) {
            null
        }
    }
}
