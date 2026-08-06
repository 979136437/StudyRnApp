package com.margelo.nitro.visibilityobserver

import android.graphics.Rect
import android.os.SystemClock
import android.view.Choreographer
import android.view.View
import android.view.ViewParent
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.common.LifecycleState
import com.facebook.react.uimanager.ThemedReactContext
import java.util.Collections
import java.util.WeakHashMap
import kotlin.math.max
import kotlin.math.min

/**
 * 所有探针共享一个 Choreographer，避免长列表中的每个元素各自注册逐帧回调。
 */
private object VisibilityFrameScheduler : Choreographer.FrameCallback {
  private val observers = Collections.newSetFromMap(
    WeakHashMap<HybridVisibilityObserverView, Boolean>(),
  )
  private var running = false

  fun add(observer: HybridVisibilityObserverView) {
    observers.add(observer)
    if (!running) {
      running = true
      Choreographer.getInstance().postFrameCallback(this)
    }
  }

  fun remove(observer: HybridVisibilityObserverView) {
    observers.remove(observer)
    if (observers.isEmpty() && running) {
      Choreographer.getInstance().removeFrameCallback(this)
      running = false
    }
  }

  override fun doFrame(frameTimeNanos: Long) {
    if (observers.isEmpty()) {
      running = false
      return
    }

    observers.toList().forEach { observer ->
      observer.onFrame(frameTimeNanos / 1_000_000.0)
    }
    Choreographer.getInstance().postFrameCallback(this)
  }
}

class HybridVisibilityObserverView(
  private val context: ThemedReactContext,
) : HybridVisibilityObserverViewSpec(), LifecycleEventListener {
  private val probeView = View(context)
  override val view: View = probeView

  override var enabled = true
  override var threshold = 0.5
  override var minimumVisibleDurationMs = 0.0
  override var measurementIntervalMs = 100.0
  override var onVisibilityChange: (NativeVisibilityChangeEvent) -> Unit = {}
    set(value) {
      field = value
      // 新回调必须收到当前初始状态，不能沿用旧回调已经发布过的标记。
      hasPublished = false
    }

  private var appActive = context.lifecycleState == LifecycleState.RESUMED
  private var disposed = false
  private var hasPublished = false
  private var lastPublishedVisible = false
  private var pendingVisibleSinceMs: Double? = null
  private var lastMeasurementMs = Double.NEGATIVE_INFINITY
  private val visibleRect = Rect()
  private val attachStateListener = object : View.OnAttachStateChangeListener {
    override fun onViewAttachedToWindow(view: View) {
      updateRegistration()
      evaluate(SystemClock.uptimeMillis().toDouble(), force = true)
    }

    override fun onViewDetachedFromWindow(view: View) {
      VisibilityFrameScheduler.remove(this@HybridVisibilityObserverView)
      evaluate(SystemClock.uptimeMillis().toDouble(), force = true)
    }
  }

  init {
    context.addLifecycleEventListener(this)
    probeView.addOnAttachStateChangeListener(attachStateListener)
  }

  override fun afterUpdate() {
    threshold = min(1.0, max(0.0, threshold))
    minimumVisibleDurationMs = max(0.0, minimumVisibleDurationMs)
    measurementIntervalMs = max(16.0, measurementIntervalMs)
    updateRegistration()
    evaluate(SystemClock.uptimeMillis().toDouble(), force = true)
  }

  internal fun onFrame(nowMs: Double) {
    evaluate(nowMs, force = false)
  }

  private fun updateRegistration() {
    if (!disposed && enabled && probeView.isAttachedToWindow) {
      VisibilityFrameScheduler.add(this)
    } else {
      VisibilityFrameScheduler.remove(this)
    }
  }

  private fun evaluate(nowMs: Double, force: Boolean) {
    if (!force && nowMs - lastMeasurementMs < measurementIntervalMs) return
    lastMeasurementMs = nowMs

    val ratio = calculateVisibleRatio()
    val candidateVisible = ratio > 0.0 && ratio >= threshold

    if (!candidateVisible) {
      pendingVisibleSinceMs = null
      publishIfChanged(isVisible = false, visibleRatio = ratio)
      return
    }

    if (hasPublished && lastPublishedVisible) return
    val pendingSince = pendingVisibleSinceMs
    if (minimumVisibleDurationMs == 0.0 ||
      (pendingSince != null && nowMs - pendingSince >= minimumVisibleDurationMs)
    ) {
      pendingVisibleSinceMs = null
      publishIfChanged(isVisible = true, visibleRatio = ratio)
    } else if (pendingSince == null) {
      pendingVisibleSinceMs = nowMs
    }
  }

  private fun calculateVisibleRatio(): Double {
    if (!enabled || !appActive || !probeView.isAttachedToWindow || !probeView.isShown) {
      return 0.0
    }
    if (probeView.width <= 0 || probeView.height <= 0) return 0.0

    var parent: ViewParent? = probeView.parent
    while (parent is View) {
      if (parent.visibility != View.VISIBLE || parent.alpha <= 0.01f) return 0.0
      parent = parent.parent
    }

    if (!probeView.getGlobalVisibleRect(visibleRect) || visibleRect.isEmpty) return 0.0
    val totalArea = probeView.width.toDouble() * probeView.height.toDouble()
    val visibleArea = visibleRect.width().toDouble() * visibleRect.height().toDouble()
    return min(1.0, max(0.0, visibleArea / totalArea))
  }

  private fun publishIfChanged(isVisible: Boolean, visibleRatio: Double) {
    if (hasPublished && lastPublishedVisible == isVisible) return
    hasPublished = true
    lastPublishedVisible = isVisible
    onVisibilityChange(
      NativeVisibilityChangeEvent(
        isVisible = isVisible,
        visibleRatio = visibleRatio,
      ),
    )
  }

  override fun onHostResume() {
    appActive = true
    evaluate(SystemClock.uptimeMillis().toDouble(), force = true)
  }

  override fun onHostPause() {
    appActive = false
    evaluate(SystemClock.uptimeMillis().toDouble(), force = true)
  }

  override fun onHostDestroy() {
    dispose()
  }

  override fun onDropView() {
    dispose()
  }

  private fun dispose() {
    if (disposed) return
    disposed = true
    VisibilityFrameScheduler.remove(this)
    context.removeLifecycleEventListener(this)
    probeView.removeOnAttachStateChangeListener(attachStateListener)
    pendingVisibleSinceMs = null
  }
}
