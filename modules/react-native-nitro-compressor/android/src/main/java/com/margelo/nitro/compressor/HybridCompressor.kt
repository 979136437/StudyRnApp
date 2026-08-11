package com.margelo.nitro.compressor

import com.margelo.nitro.core.Promise
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors

class HybridCompressor : HybridCompressorSpec() {
  override fun createOperationId(): String = UUID.randomUUID().toString()

  override fun compressImage(
    operationId: String,
    source: String,
    options: ImageCompressionOptions,
  ): Promise<CompressionResult> = parallelTask(operationId, "jpg", source) { access, output, state ->
    ImageProcessor.compress(access, output, options, state)
  }

  override fun compressVideo(
    operationId: String,
    source: String,
    options: VideoCompressionOptions,
  ): Promise<CompressionResult> {
    val promise = Promise<CompressionResult>()
    val state = try {
      CompressionTasks.register(operationId)
    } catch (error: Throwable) {
      promise.reject(error)
      return promise
    }
    videoExecutor.execute {
      val output = outputFile(operationId, "mp4")
      try {
        CompressionTasks.check(state)
        val access = MediaSourceAccess(CompressorContext.require(), source)
        promise.resolve(VideoTranscoder.compress(access, output, options, state))
      } catch (error: Throwable) {
        CompressionTasks.deleteQuietly(output)
        promise.reject(error)
      } finally {
        CompressionTasks.finish(operationId)
      }
    }
    return promise
  }

  override fun getImageMetadata(source: String): Promise<ImageMetadata> = Promise.parallel {
    ImageProcessor.metadata(MediaSourceAccess(CompressorContext.require(), source))
  }

  override fun getVideoMetadata(source: String): Promise<VideoMetadata> = Promise.parallel {
    VideoInfoReader.metadata(MediaSourceAccess(CompressorContext.require(), source))
  }

  override fun createVideoThumbnail(
    operationId: String,
    source: String,
    options: ThumbnailOptions,
  ): Promise<ThumbnailResult> = parallelTask(operationId, "jpg", source) { access, output, state ->
    VideoInfoReader.thumbnail(access, output, options, state)
  }

  override fun cancel(operationId: String): Boolean = CompressionTasks.cancel(operationId)

  private fun <T> parallelTask(
    operationId: String,
    extension: String,
    source: String,
    run: (MediaSourceAccess, File, java.util.concurrent.atomic.AtomicBoolean) -> T,
  ): Promise<T> = Promise.parallel {
    val state = CompressionTasks.register(operationId)
    val output = outputFile(operationId, extension)
    try {
      CompressionTasks.check(state)
      run(MediaSourceAccess(CompressorContext.require(), source), output, state)
    } catch (error: Throwable) {
      CompressionTasks.deleteQuietly(output)
      throw error
    } finally {
      CompressionTasks.finish(operationId)
    }
  }

  private fun outputFile(operationId: String, extension: String): File {
    val directory = File(CompressorContext.require().cacheDir, "nitro-compressor")
    check(directory.exists() || directory.mkdirs()) { "Unable to create compressor cache" }
    return File(directory, "$operationId.$extension")
  }

  companion object {
    private val videoExecutor = Executors.newSingleThreadExecutor { runnable ->
      Thread(runnable, "NitroVideoCompressor")
    }
  }
}
