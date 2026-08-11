package com.margelo.nitro.compressor

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.os.Build
import java.io.File
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

internal object VideoTranscoder {
  private const val VIDEO_MIME = "video/avc"
  private const val TIMEOUT_US = 10_000L

  fun compress(
    access: MediaSourceAccess,
    output: File,
    options: VideoCompressionOptions,
    cancelled: AtomicBoolean,
  ): CompressionResult {
    val sourceInfo = VideoInfoReader.read(access)
    val scale = min(1.0, options.maxDimension / max(sourceInfo.displayWidth, sourceInfo.displayHeight))
    val outputWidth = even(sourceInfo.codedWidth * scale)
    val outputHeight = even(sourceInfo.codedHeight * scale)
    val requestedFps = options.fps ?: min(if (sourceInfo.fps > 0) sourceInfo.fps else 30.0, 30.0)
    val targetFps = commonFps(min(requestedFps, if (sourceInfo.fps > 0) sourceInfo.fps else requestedFps))
    val pixelRatio = outputWidth.toDouble() * outputHeight /
      (sourceInfo.codedWidth.toDouble() * sourceInfo.codedHeight)
    val fpsRatio = if (sourceInfo.fps > 0) min(1.0, targetFps / sourceInfo.fps) else 1.0
    val derivedBitrate = if (sourceInfo.bitrate > 0) {
      (sourceInfo.bitrate * pixelRatio * fpsRatio).roundToInt()
    } else {
      (outputWidth * outputHeight * targetFps * 0.1).roundToInt()
    }
    val requestedBitrate = options.bitrate?.roundToInt() ?: derivedBitrate
    val encoders = MediaCodecList(MediaCodecList.ALL_CODECS).codecInfos
      .filter { it.isEncoder && it.supportedTypes.any { type -> type.equals(VIDEO_MIME, true) } }
      .sortedWith(compareBy<MediaCodecInfo> { isSoftwareEncoder(it) }.thenBy { it.name })
    check(encoders.isNotEmpty()) { "No H.264 encoder is available" }

    var lastError: Throwable? = null
    for (codecInfo in encoders) {
      CompressionTasks.check(cancelled)
      val capabilities = try {
        codecInfo.getCapabilitiesForType(VIDEO_MIME).videoCapabilities
      } catch (_: Exception) {
        continue
      }
      if (!capabilities.isSizeSupported(outputWidth, outputHeight)) continue
      val supportedFps = capabilities.getSupportedFrameRatesFor(outputWidth, outputHeight)
      val codecFps = commonFps(min(targetFps, supportedFps.upper))
      val codecBitrate = capabilities.bitrateRange.clamp(requestedBitrate)
      try {
        CompressionTasks.deleteQuietly(output)
        transcode(
          access,
          output,
          codecInfo.name,
          outputWidth,
          outputHeight,
          codecFps,
          codecBitrate,
          sourceInfo.rotation,
          cancelled,
        )
        CompressionTasks.check(cancelled)
        val result = VideoInfoReader.read(MediaSourceAccess(CompressorContext.require(), output.path))
        return CompressionResult(
          path = output.toURI().toString(),
          size = output.length().toDouble(),
          width = result.displayWidth.toDouble(),
          height = result.displayHeight.toDouble(),
          duration = result.durationSeconds,
          fps = if (result.fps > 0) result.fps else codecFps,
          bitrate = if (result.bitrate > 0) result.bitrate else codecBitrate.toDouble(),
        )
      } catch (error: Throwable) {
        CompressionTasks.deleteQuietly(output)
        if (error is CompressionCancelledException) throw error
        lastError = error
      }
    }
    throw IllegalStateException("All compatible H.264 encoders failed", lastError)
  }

  private fun transcode(
    access: MediaSourceAccess,
    output: File,
    encoderName: String,
    width: Int,
    height: Int,
    fps: Double,
    bitrate: Int,
    rotation: Int,
    cancelled: AtomicBoolean,
  ) {
    val extractor = MediaExtractor()
    val audioExtractor = MediaExtractor()
    val temporaryAudio = File(output.parentFile, "${output.nameWithoutExtension}-audio.mp4")
    var encoder: MediaCodec? = null
    var decoder: MediaCodec? = null
    var inputSurface: CodecInputSurface? = null
    var outputSurface: CodecOutputSurface? = null
    var muxer: MediaMuxer? = null
    var muxerStarted = false
    try {
      access.configure(extractor)
      val videoTrack = findTrack(extractor, "video/")
      check(videoTrack >= 0) { "Video track is missing" }
      val inputFormat = extractor.getTrackFormat(videoTrack)
      val inputMime = requireNotNull(inputFormat.getString(MediaFormat.KEY_MIME))
      extractor.selectTrack(videoTrack)

      val preparedAudio = AudioTranscoder.prepare(access, temporaryAudio, cancelled)
      preparedAudio?.configure(audioExtractor)
      val audioTrack = if (preparedAudio != null) findTrack(audioExtractor, "audio/") else -1
      val audioFormat = if (audioTrack >= 0) audioExtractor.getTrackFormat(audioTrack) else null
      val canCopyAudio = audioFormat != null

      val outputFormat = MediaFormat.createVideoFormat(VIDEO_MIME, width, height).apply {
        setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
        setInteger(MediaFormat.KEY_BIT_RATE, bitrate)
        setInteger(MediaFormat.KEY_FRAME_RATE, fps.roundToInt())
        setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
      }
      val videoEncoder = MediaCodec.createByCodecName(encoderName).apply {
        configure(outputFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        val surface = createInputSurface()
        start()
        inputSurface = CodecInputSurface(surface).also { it.makeCurrent() }
      }
      encoder = videoEncoder
      val decoderSurface = CodecOutputSurface()
      outputSurface = decoderSurface
      val videoDecoder = MediaCodec.createDecoderByType(inputMime).apply {
        configure(inputFormat, decoderSurface.surface, null, 0)
        start()
      }
      decoder = videoDecoder
      val mediaMuxer = MediaMuxer(output.path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4).apply {
        if (rotation != 0) setOrientationHint(rotation)
      }
      muxer = mediaMuxer
      val muxerAudioTrack = if (canCopyAudio) mediaMuxer.addTrack(requireNotNull(audioFormat)) else -1
      var muxerVideoTrack = -1

      val decoderInfo = MediaCodec.BufferInfo()
      val encoderInfo = MediaCodec.BufferInfo()
      var inputDone = false
      var decoderDone = false
      var encoderDone = false
      var encoderEosSignalled = false
      var nextFrameUs = 0L
      val frameIntervalUs = (1_000_000.0 / fps).toLong()

      while (!encoderDone) {
        CompressionTasks.check(cancelled)
        if (!inputDone) {
          val index = videoDecoder.dequeueInputBuffer(TIMEOUT_US)
          if (index >= 0) {
            val buffer = requireNotNull(videoDecoder.getInputBuffer(index))
            val size = extractor.readSampleData(buffer, 0)
            if (size < 0) {
              videoDecoder.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              videoDecoder.queueInputBuffer(index, 0, size, extractor.sampleTime, extractor.sampleFlags)
              extractor.advance()
            }
          }
        }

        if (!decoderDone) {
          val status = videoDecoder.dequeueOutputBuffer(decoderInfo, TIMEOUT_US)
          if (status >= 0) {
            val end = decoderInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
            val render = decoderInfo.size > 0 && decoderInfo.presentationTimeUs >= nextFrameUs
            videoDecoder.releaseOutputBuffer(status, render)
            if (render) {
              requireNotNull(outputSurface).awaitAndDraw(width, height)
              requireNotNull(inputSurface).setPresentationTime(decoderInfo.presentationTimeUs * 1_000L)
              check(requireNotNull(inputSurface).swapBuffers()) { "Unable to submit encoded frame" }
              nextFrameUs = decoderInfo.presentationTimeUs + frameIntervalUs
            }
            if (end) decoderDone = true
          }
        }

        if (decoderDone && !encoderEosSignalled) {
          videoEncoder.signalEndOfInputStream()
          encoderEosSignalled = true
        }

        var draining = true
        while (draining) {
          val status = videoEncoder.dequeueOutputBuffer(encoderInfo, TIMEOUT_US)
          when {
            status == MediaCodec.INFO_TRY_AGAIN_LATER -> draining = false
            status == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
              check(!muxerStarted) { "Encoder output format changed twice" }
              muxerVideoTrack = mediaMuxer.addTrack(videoEncoder.outputFormat)
              mediaMuxer.start()
              muxerStarted = true
            }
            status >= 0 -> {
              val buffer = requireNotNull(videoEncoder.getOutputBuffer(status))
              if (encoderInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
                encoderInfo.size = 0
              }
              if (encoderInfo.size > 0) {
                check(muxerStarted) { "Muxer has not started" }
                buffer.position(encoderInfo.offset)
                buffer.limit(encoderInfo.offset + encoderInfo.size)
                mediaMuxer.writeSampleData(muxerVideoTrack, buffer, encoderInfo)
              }
              encoderDone = encoderInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
              videoEncoder.releaseOutputBuffer(status, false)
            }
          }
        }
      }

      if (canCopyAudio && muxerStarted) {
        audioExtractor.selectTrack(audioTrack)
        copyAudio(audioExtractor, mediaMuxer, muxerAudioTrack, cancelled)
      }
    } finally {
      try { extractor.release() } catch (_: Exception) {}
      try { audioExtractor.release() } catch (_: Exception) {}
      try { decoder?.stop() } catch (_: Exception) {}
      try { decoder?.release() } catch (_: Exception) {}
      try { outputSurface?.close() } catch (_: Exception) {}
      try { encoder?.stop() } catch (_: Exception) {}
      try { encoder?.release() } catch (_: Exception) {}
      try { inputSurface?.close() } catch (_: Exception) {}
      if (muxerStarted) try { muxer?.stop() } catch (_: Exception) {}
      try { muxer?.release() } catch (_: Exception) {}
      CompressionTasks.deleteQuietly(temporaryAudio)
    }
  }

  private fun copyAudio(
    extractor: MediaExtractor,
    muxer: MediaMuxer,
    track: Int,
    cancelled: AtomicBoolean,
  ) {
    val buffer = ByteBuffer.allocateDirect(1 shl 20)
    val info = MediaCodec.BufferInfo()
    while (true) {
      CompressionTasks.check(cancelled)
      buffer.clear()
      val size = extractor.readSampleData(buffer, 0)
      if (size < 0) break
      info.set(0, size, extractor.sampleTime, extractor.sampleFlags)
      muxer.writeSampleData(track, buffer, info)
      extractor.advance()
    }
  }

  private fun findTrack(extractor: MediaExtractor, prefix: String): Int {
    for (index in 0 until extractor.trackCount) {
      if (extractor.getTrackFormat(index).getString(MediaFormat.KEY_MIME)?.startsWith(prefix) == true) {
        return index
      }
    }
    return -1
  }

  private fun even(value: Double): Int = max(2, (value.roundToInt() / 2) * 2)

  private fun commonFps(value: Double): Double {
    return listOf(60.0, 50.0, 30.0, 25.0, 24.0, 15.0)
      .firstOrNull { it <= value + 0.01 } ?: max(1.0, value)
  }

  private fun isSoftwareEncoder(info: MediaCodecInfo): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) return info.isSoftwareOnly
    val name = info.name.lowercase()
    return name.startsWith("omx.google.") || name.startsWith("c2.android.")
  }
}
