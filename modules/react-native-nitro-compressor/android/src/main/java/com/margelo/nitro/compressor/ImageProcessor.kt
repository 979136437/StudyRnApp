package com.margelo.nitro.compressor

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.media.ExifInterface
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

internal object ImageProcessor {
  fun metadata(access: MediaSourceAccess): ImageMetadata {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    access.openStream().use { BitmapFactory.decodeStream(it, null, bounds) }
    check(bounds.outWidth > 0 && bounds.outHeight > 0) { "Unable to decode image metadata" }
    val orientation = readOrientation(access)
    val rotated = orientation in setOf(
      ExifInterface.ORIENTATION_ROTATE_90,
      ExifInterface.ORIENTATION_ROTATE_270,
      ExifInterface.ORIENTATION_TRANSPOSE,
      ExifInterface.ORIENTATION_TRANSVERSE,
    )
    return ImageMetadata(
      size = access.size().toDouble(),
      width = (if (rotated) bounds.outHeight else bounds.outWidth).toDouble(),
      height = (if (rotated) bounds.outWidth else bounds.outHeight).toDouble(),
    )
  }

  fun compress(
    access: MediaSourceAccess,
    output: File,
    options: ImageCompressionOptions,
    cancelled: AtomicBoolean,
  ): CompressionResult {
    val metadata = metadata(access)
    val scale = min(
      1.0,
      min(
        options.maxWidth?.div(metadata.width) ?: 1.0,
        options.maxHeight?.div(metadata.height) ?: 1.0,
      ),
    )
    val targetWidth = max(1, (metadata.width * scale).roundToInt())
    val targetHeight = max(1, (metadata.height * scale).roundToInt())

    val decodeBounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    access.openStream().use { BitmapFactory.decodeStream(it, null, decodeBounds) }
    var sample = 1
    while (decodeBounds.outWidth / (sample * 2) >= targetWidth &&
      decodeBounds.outHeight / (sample * 2) >= targetHeight
    ) sample *= 2

    CompressionTasks.check(cancelled)
    val decoded = access.openStream().use {
      BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
    } ?: error("Unable to decode image")
    val oriented = orient(decoded, readOrientation(access))
    val scaled = if (oriented.width != targetWidth || oriented.height != targetHeight) {
      Bitmap.createScaledBitmap(oriented, targetWidth, targetHeight, true)
    } else oriented
    val flattened = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888)
    Canvas(flattened).apply {
      drawColor(Color.WHITE)
      drawBitmap(scaled, 0f, 0f, null)
    }

    try {
      CompressionTasks.check(cancelled)
      FileOutputStream(output).use { stream ->
        check(flattened.compress(Bitmap.CompressFormat.JPEG, options.quality.toInt(), stream)) {
          "Unable to encode JPEG"
        }
      }
      CompressionTasks.check(cancelled)
      return CompressionResult(
        path = output.toURI().toString(),
        size = output.length().toDouble(),
        width = targetWidth.toDouble(),
        height = targetHeight.toDouble(),
        duration = 0.0,
        fps = 0.0,
        bitrate = 0.0,
      )
    } finally {
      if (flattened !== scaled) flattened.recycle()
      if (scaled !== oriented) scaled.recycle()
      if (oriented !== decoded) oriented.recycle()
      decoded.recycle()
    }
  }

  private fun readOrientation(access: MediaSourceAccess): Int = try {
    access.openStream().use {
      ExifInterface(it).getAttributeInt(
        ExifInterface.TAG_ORIENTATION,
        ExifInterface.ORIENTATION_NORMAL,
      )
    }
  } catch (_: Exception) {
    ExifInterface.ORIENTATION_NORMAL
  }

  private fun orient(bitmap: Bitmap, orientation: Int): Bitmap {
    val matrix = Matrix()
    when (orientation) {
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.setScale(-1f, 1f)
      ExifInterface.ORIENTATION_ROTATE_180 -> matrix.setRotate(180f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.setScale(1f, -1f)
      ExifInterface.ORIENTATION_TRANSPOSE -> {
        matrix.setRotate(90f)
        matrix.postScale(-1f, 1f)
      }
      ExifInterface.ORIENTATION_ROTATE_90 -> matrix.setRotate(90f)
      ExifInterface.ORIENTATION_TRANSVERSE -> {
        matrix.setRotate(-90f)
        matrix.postScale(-1f, 1f)
      }
      ExifInterface.ORIENTATION_ROTATE_270 -> matrix.setRotate(-90f)
      else -> return bitmap
    }
    return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
  }
}
