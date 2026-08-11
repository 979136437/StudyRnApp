package com.margelo.nitro.compressor

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

internal object AudioTranscoder {
  private const val TIMEOUT_US = 10_000L

  /** 返回可直接复用的 AAC 源；没有音轨时返回 null。 */
  fun prepare(
    source: MediaSourceAccess,
    output: File,
    cancelled: AtomicBoolean,
  ): MediaSourceAccess? {
    val probe = MediaExtractor()
    try {
      source.configure(probe)
      val track = findAudioTrack(probe)
      if (track < 0) return null
      val mime = probe.getTrackFormat(track).getString(MediaFormat.KEY_MIME)
      if (mime == MediaFormat.MIMETYPE_AUDIO_AAC) return source
    } finally {
      probe.release()
    }
    CompressionTasks.deleteQuietly(output)
    transcode(source, output, cancelled)
    return MediaSourceAccess(CompressorContext.require(), output.path)
  }

  private fun transcode(
    source: MediaSourceAccess,
    output: File,
    cancelled: AtomicBoolean,
  ) {
    val extractor = MediaExtractor()
    var decoder: MediaCodec? = null
    var encoder: MediaCodec? = null
    var muxer: MediaMuxer? = null
    var muxerStarted = false
    try {
      source.configure(extractor)
      val track = findAudioTrack(extractor)
      check(track >= 0) { "Audio track is missing" }
      extractor.selectTrack(track)
      val inputFormat = extractor.getTrackFormat(track)
      val inputMime = requireNotNull(inputFormat.getString(MediaFormat.KEY_MIME))
      val sampleRate = inputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      val sourceChannelCount = inputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      val channelCount = minOf(2, sourceChannelCount)

      val audioDecoder = MediaCodec.createDecoderByType(inputMime).apply {
        configure(inputFormat, null, null, 0)
        start()
      }
      decoder = audioDecoder
      val audioEncoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC).apply {
        configure(
          MediaFormat.createAudioFormat(
            MediaFormat.MIMETYPE_AUDIO_AAC,
            sampleRate,
            channelCount,
          ).apply {
            setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
            setInteger(MediaFormat.KEY_BIT_RATE, if (channelCount == 1) 96_000 else 128_000)
            setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 64 * 1024)
          },
          null,
          null,
          MediaCodec.CONFIGURE_FLAG_ENCODE,
        )
        start()
      }
      encoder = audioEncoder
      val audioMuxer = MediaMuxer(output.path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      muxer = audioMuxer
      val decoderInfo = MediaCodec.BufferInfo()
      val encoderInfo = MediaCodec.BufferInfo()
      var inputDone = false
      var decoderDone = false
      var encoderDone = false
      var encoderTrack = -1

      while (!encoderDone) {
        CompressionTasks.check(cancelled)
        if (!inputDone) {
          val inputIndex = audioDecoder.dequeueInputBuffer(TIMEOUT_US)
          if (inputIndex >= 0) {
            val input = requireNotNull(audioDecoder.getInputBuffer(inputIndex))
            val size = extractor.readSampleData(input, 0)
            if (size < 0) {
              audioDecoder.queueInputBuffer(
                inputIndex,
                0,
                0,
                0,
                MediaCodec.BUFFER_FLAG_END_OF_STREAM,
              )
              inputDone = true
            } else {
              audioDecoder.queueInputBuffer(
                inputIndex,
                0,
                size,
                extractor.sampleTime,
                extractor.sampleFlags,
              )
              extractor.advance()
            }
          }
        }

        if (!decoderDone) {
          val outputIndex = audioDecoder.dequeueOutputBuffer(decoderInfo, TIMEOUT_US)
          if (outputIndex >= 0) {
            val encoderInputIndex = waitForEncoderInput(audioEncoder, cancelled)
            val encoderInput = requireNotNull(audioEncoder.getInputBuffer(encoderInputIndex))
            encoderInput.clear()
            val encodedSize = if (decoderInfo.size > 0) {
              val decoded = requireNotNull(audioDecoder.getOutputBuffer(outputIndex))
              decoded.position(decoderInfo.offset)
              decoded.limit(decoderInfo.offset + decoderInfo.size)
              copyPcm(decoded, encoderInput, sourceChannelCount, channelCount)
            } else 0
            val end = decoderInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
            audioEncoder.queueInputBuffer(
              encoderInputIndex,
              0,
              encodedSize,
              decoderInfo.presentationTimeUs,
              if (end) MediaCodec.BUFFER_FLAG_END_OF_STREAM else 0,
            )
            audioDecoder.releaseOutputBuffer(outputIndex, false)
            decoderDone = end
          }
        }

        var draining = true
        while (draining) {
          val outputIndex = audioEncoder.dequeueOutputBuffer(encoderInfo, TIMEOUT_US)
          when {
            outputIndex == MediaCodec.INFO_TRY_AGAIN_LATER -> draining = false
            outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
              encoderTrack = audioMuxer.addTrack(audioEncoder.outputFormat)
              audioMuxer.start()
              muxerStarted = true
            }
            outputIndex >= 0 -> {
              val encoded = requireNotNull(audioEncoder.getOutputBuffer(outputIndex))
              if (encoderInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
                encoderInfo.size = 0
              }
              if (encoderInfo.size > 0) {
                check(muxerStarted) { "Audio muxer has not started" }
                encoded.position(encoderInfo.offset)
                encoded.limit(encoderInfo.offset + encoderInfo.size)
                audioMuxer.writeSampleData(encoderTrack, encoded, encoderInfo)
              }
              encoderDone = encoderInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
              audioEncoder.releaseOutputBuffer(outputIndex, false)
            }
          }
        }
      }
    } finally {
      try { extractor.release() } catch (_: Exception) {}
      try { decoder?.stop() } catch (_: Exception) {}
      try { decoder?.release() } catch (_: Exception) {}
      try { encoder?.stop() } catch (_: Exception) {}
      try { encoder?.release() } catch (_: Exception) {}
      if (muxerStarted) try { muxer?.stop() } catch (_: Exception) {}
      try { muxer?.release() } catch (_: Exception) {}
    }
  }

  private fun waitForEncoderInput(
    encoder: MediaCodec,
    cancelled: AtomicBoolean,
  ): Int {
    while (true) {
      CompressionTasks.check(cancelled)
      val index = encoder.dequeueInputBuffer(TIMEOUT_US)
      if (index >= 0) return index
    }
  }

  private fun copyPcm(
    source: java.nio.ByteBuffer,
    target: java.nio.ByteBuffer,
    sourceChannels: Int,
    targetChannels: Int,
  ): Int {
    if (sourceChannels <= targetChannels) {
      check(target.remaining() >= source.remaining()) { "Decoded audio buffer is too large" }
      val size = source.remaining()
      target.put(source)
      return size
    }
    // 系统解码器默认输出 16 位交错 PCM；多声道首期保留前两个声道。
    val sourceShorts = source.order(java.nio.ByteOrder.nativeOrder()).asShortBuffer()
    val targetShorts = target.order(java.nio.ByteOrder.nativeOrder()).asShortBuffer()
    val frameCount = sourceShorts.remaining() / sourceChannels
    check(targetShorts.remaining() >= frameCount * targetChannels) { "Decoded audio buffer is too large" }
    repeat(frameCount) {
      val frameStart = sourceShorts.position()
      repeat(targetChannels) { channel ->
        targetShorts.put(sourceShorts.get(frameStart + channel))
      }
      sourceShorts.position(frameStart + sourceChannels)
    }
    return frameCount * targetChannels * 2
  }

  private fun findAudioTrack(extractor: MediaExtractor): Int {
    for (index in 0 until extractor.trackCount) {
      if (extractor.getTrackFormat(index).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) {
        return index
      }
    }
    return -1
  }
}
