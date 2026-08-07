package com.margelo.nitro.imagepicker

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.os.OperationCanceledException
import android.provider.MediaStore
import android.util.Size
import android.view.View
import android.widget.ImageView
import com.facebook.react.uimanager.ThemedReactContext
import com.margelo.nitro.views.RecyclableView
import java.util.concurrent.Executors
import java.util.concurrent.Future

class HybridMediaThumbnail(
  private val context: ThemedReactContext,
) : HybridMediaThumbnailSpec(), RecyclableView {
  private val imageView = ImageView(context).apply {
    setBackgroundColor(0xffe5e5ea.toInt())
  }
  private val executor = Executors.newSingleThreadExecutor()
  private val mainHandler = Handler(Looper.getMainLooper())
  private var loadTask: Future<*>? = null
  private var cancellationSignal: CancellationSignal? = null
  private var requestedKey = ""
  @Volatile private var disposed = false

  override val view: View = imageView
  override var assetId = ""
  override var resizeMode = ThumbnailResizeMode.COVER
  override var shouldDownloadFromNetwork = true
  override var onLoad: (ThumbnailLoadEvent) -> Unit = {}
  override var onError: (ThumbnailErrorEvent) -> Unit = {}

  init {
    imageView.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> loadIfNeeded() }
  }

  override fun afterUpdate() {
    imageView.scaleType = if (resizeMode == ThumbnailResizeMode.CONTAIN) {
      ImageView.ScaleType.FIT_CENTER
    } else {
      ImageView.ScaleType.CENTER_CROP
    }
    loadIfNeeded()
  }

  private fun loadIfNeeded() {
    if (disposed || assetId.isBlank() || imageView.width <= 0 || imageView.height <= 0) return
    val key = "$assetId:${imageView.width}x${imageView.height}:$resizeMode"
    if (key == requestedKey) return
    cancelRequest()
    requestedKey = key
    imageView.setImageDrawable(null)
    val expectedId = assetId
    val requestedWidth = imageView.width
    val requestedHeight = imageView.height
    val signal = CancellationSignal()
    cancellationSignal = signal
    loadTask = executor.submit {
      try {
        val bitmap = loadBitmap(expectedId, requestedWidth, requestedHeight, signal)
        mainHandler.post {
          if (!disposed && !signal.isCanceled && assetId == expectedId) {
            imageView.setImageBitmap(bitmap)
            onLoad(ThumbnailLoadEvent(expectedId, bitmap.width.toDouble(), bitmap.height.toDouble()))
          }
        }
      } catch (error: Throwable) {
        mainHandler.post {
          if (!signal.isCanceled && !disposed && assetId == expectedId) {
            onError(ThumbnailErrorEvent(expectedId, error.message ?: "缩略图加载失败"))
          }
        }
      }
    }
  }

  private fun loadBitmap(
    id: String,
    width: Int,
    height: Int,
    signal: CancellationSignal,
  ): Bitmap {
    val uri = android.net.Uri.parse(id)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      return context.contentResolver.loadThumbnail(uri, Size(width, height), signal)
    }
    val mimeType = context.contentResolver.getType(uri).orEmpty()
    if (mimeType.startsWith("video/")) {
      val mediaId = uri.lastPathSegment?.toLongOrNull()
        ?: throw Error("无效的视频资源标识")
      return MediaStore.Video.Thumbnails.getThumbnail(
        context.contentResolver,
        mediaId,
        MediaStore.Video.Thumbnails.MINI_KIND,
        null,
      ) ?: throw Error("无法生成视频封面")
    }
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri).use { input ->
      requireNotNull(input) { "无法打开图片资源" }
      BitmapFactory.decodeStream(input, null, bounds)
    }
    if (signal.isCanceled) throw OperationCanceledException()
    var sampleSize = 1
    while (bounds.outWidth / (sampleSize * 2) >= width &&
      bounds.outHeight / (sampleSize * 2) >= height
    ) {
      sampleSize *= 2
    }
    val decodeOptions = BitmapFactory.Options().apply { inSampleSize = sampleSize }
    return context.contentResolver.openInputStream(uri).use { input ->
      requireNotNull(input) { "无法打开图片资源" }
      BitmapFactory.decodeStream(input, null, decodeOptions) ?: throw Error("无法解码图片资源")
    }
  }

  private fun cancelRequest() {
    cancellationSignal?.cancel()
    cancellationSignal = null
    loadTask?.cancel(true)
    loadTask = null
  }

  override fun prepareForRecycle() {
    cancelRequest()
    requestedKey = ""
    assetId = ""
    imageView.setImageDrawable(null)
  }

  override fun onDropView() {
    if (disposed) return
    disposed = true
    prepareForRecycle()
    executor.shutdownNow()
    onLoad = {}
    onError = {}
  }
}
