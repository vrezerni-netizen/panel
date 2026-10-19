package app.streamvault.sender

import android.content.Context
import android.graphics.Rect
import android.os.Build
import android.util.DisplayMetrics
import android.view.WindowManager

/** Quality presets and the real-screen-shaped video size (so the picture is never stretched). */
object VideoSpec {
    fun longSide(q: Int) = if (q == 0) 1280 else 1920
    fun bitrate(q: Int) = when (q) { 0 -> 3_000_000; 1 -> 8_000_000; else -> 12_000_000 }
    fun label(q: Int) = when (q) { 0 -> "720p"; 1 -> "1080p"; else -> "1080p+" }

    /** Width/height of the screen picture in the chosen orientation, scaled to the quality's long side. */
    fun screenSize(ctx: Context, landscape: Boolean, q: Int): Pair<Int, Int> {
        val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val bounds: Rect = if (Build.VERSION.SDK_INT >= 30) wm.maximumWindowMetrics.bounds else {
            val m = DisplayMetrics()
            @Suppress("DEPRECATION") wm.defaultDisplay.getRealMetrics(m)
            Rect(0, 0, m.widthPixels, m.heightPixels)
        }
        val a = maxOf(bounds.width(), bounds.height()).toFloat()
        val b = minOf(bounds.width(), bounds.height()).toFloat()
        val long = longSide(q)
        val short = ((long * b / a).toInt() / 2) * 2 // even number for the encoder
        return if (landscape) long to short else short to long
    }

    /** Camera sensors are 16:9 here. */
    fun cameraSize(q: Int, landscape: Boolean): Pair<Int, Int> {
        val w = longSide(q); val h = if (q == 0) 720 else 1080
        return if (landscape) w to h else h to w
    }
}
