package com.margelo.nitro.compressor

import android.graphics.Bitmap
import android.graphics.Matrix
import android.media.MediaMetadataRetriever
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max
import kotlin.math.roundToInt

internal data class NativeVideoInfo(
  val codedWidth: Int,
  val codedHeight: Int,
  val rotation: Int,
  val durationSeconds: Double,
  val fps: Double,
  val bitrate: Double,
  val size: Long,
) {
  val displayWidth: Int get() = if (rotation % 180 == 0) codedWidth else codedHeight
  val displayHeight: Int get() = if (rotation % 180 == 0) codedHeight else codedWidth
}

internal object VideoInfoReader {
  fun read(access: MediaSourceAccess): NativeVideoInfo {
    val retriever = MediaMetadataRetriever()
    try {
      access.configure(retriever)
      fun value(key: Int) = retriever.extractMetadata(key)
      val width = value(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
      val height = value(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
      check(width > 0 && height > 0) { "Unable to read video dimensions" }
      return NativeVideoInfo(
        codedWidth = width,
        codedHeight = height,
        rotation = value(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0,
        durationSeconds = (value(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toDoubleOrNull() ?: 0.0) / 1000.0,
        fps = value(MediaMetadataRetriever.METADATA_KEY_CAPTURE_FRAMERATE)?.toDoubleOrNull() ?: 0.0,
        bitrate = value(MediaMetadataRetriever.METADATA_KEY_BITRATE)?.toDoubleOrNull() ?: 0.0,
        size = access.size(),
      )
    } finally {
      retriever.release()
    }
  }

  fun metadata(access: MediaSourceAccess): VideoMetadata {
    val info = read(access)
    return VideoMetadata(
      size = info.size.toDouble(),
      width = info.displayWidth.toDouble(),
      height = info.displayHeight.toDouble(),
      duration = info.durationSeconds,
      fps = info.fps,
      bitrate = info.bitrate,
    )
  }

  fun thumbnail(
    access: MediaSourceAccess,
    output: File,
    options: ThumbnailOptions,
    cancelled: AtomicBoolean,
  ): ThumbnailResult {
    val retriever = MediaMetadataRetriever()
    try {
      access.configure(retriever)
      CompressionTasks.check(cancelled)
      val frame = retriever.getFrameAtTime(
        (options.time * 1_000_000.0).toLong(),
        MediaMetadataRetriever.OPTION_CLOSEST_SYNC,
      ) ?: error("Unable to decode video thumbnail")
      val rotation = retriever
        .extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)
        ?.toFloatOrNull() ?: 0f
      val oriented = if (rotation != 0f) {
        Bitmap.createBitmap(
          frame,
          0,
          0,
          frame.width,
          frame.height,
          Matrix().apply { postRotate(rotation) },
          true,
        )
      } else frame
      val scale = options.maxWidth?.let { maxWidth ->
        minOf(1.0, maxWidth / oriented.width)
      } ?: 1.0
      val width = max(1, (oriented.width * scale).roundToInt())
      val height = max(1, (oriented.height * scale).roundToInt())
      val scaled = if (width != oriented.width) {
        Bitmap.createScaledBitmap(oriented, width, height, true)
      } else oriented
      try {
        FileOutputStream(output).use {
          check(scaled.compress(Bitmap.CompressFormat.JPEG, options.quality.toInt(), it)) {
            "Unable to encode thumbnail"
          }
        }
        CompressionTasks.check(cancelled)
        return ThumbnailResult(
          path = output.toURI().toString(),
          size = output.length().toDouble(),
          width = width.toDouble(),
          height = height.toDouble(),
        )
      } finally {
        if (scaled !== oriented) scaled.recycle()
        if (oriented !== frame) oriented.recycle()
        frame.recycle()
      }
    } finally {
      retriever.release()
    }
  }
}
