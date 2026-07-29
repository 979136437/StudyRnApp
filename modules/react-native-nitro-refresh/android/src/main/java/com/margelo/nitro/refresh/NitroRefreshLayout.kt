package com.margelo.nitro.refresh

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import com.facebook.react.uimanager.PixelUtil
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong

/**
 * Android 下拉刷新原生容器。
 *
 * 连续位移通过 Fabric 事件发送给 Reanimated，离散阶段及命令通过 Nitro 控制器传递。
 * 程序化拉满、结果停留和回弹均在主线程内完成，不会逐帧调用 JavaScript。
 */
internal class NitroRefreshLayout(context: Context) : ViewGroup(context) {
  /** 禁用时立即取消当前刷新或下拉动画，并把内容恢复到原位。 */
  var refreshEnabled = true
    set(value) {
      field = value
      if (!value) cancelCurrentAction()
    }

  /** 触发阈值和刷新保持高度，单位为 dp。 */
  var pullDistanceDp = 80.0

  /** 内容允许下移的最大距离，单位为 dp。 */
  var maxPullDistanceDp = 160.0

  /** 原始手指距离转换为内容位移时使用的阻尼系数。 */
  var dragRate = 0.5

  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
  private var initialX = 0f
  private var initialY = 0f
  private var dragging = false
  private var programmaticPull = false
  private var offsetPx = 0f
  private var phase = RefreshPhase.IDLE
  private var controller: HybridRefreshController? = null
  private var animator: ValueAnimator? = null
  private var resultDismissRunnable: Runnable? = null

  private val pullDistancePx: Float
    get() = PixelUtil.toPixelFromDIP(pullDistanceDp)
  private val maxPullDistancePx: Float
    get() = PixelUtil.toPixelFromDIP(maxPullDistanceDp)

  fun attachController(controllerId: String) {
    controller?.detach(this)
    controller = HybridRefreshController.find(controllerId)
    controller?.attach(this)
  }

  internal fun publishStateToController() {
    publishSnapshot()
  }

  override fun onDetachedFromWindow() {
    cancelResultDismiss()
    animator?.cancel()
    animator = null
    controller?.detach(this)
    controller = null
    super.onDetachedFromWindow()
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(
      MeasureSpec.getSize(widthMeasureSpec),
      MeasureSpec.getSize(heightMeasureSpec),
    )
    if (childCount > 0) {
      getChildAt(0).measure(widthMeasureSpec, heightMeasureSpec)
    }
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    if (childCount > 0) {
      getChildAt(0).layout(0, 0, right - left, bottom - top)
    }
  }

  override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
    if (!refreshEnabled || isInteractionLocked() || childCount == 0) {
      return false
    }
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        initialX = event.x
        initialY = event.y
        dragging = false
      }
      MotionEvent.ACTION_MOVE -> {
        val dx = event.x - initialX
        val dy = event.y - initialY
        if (dy > touchSlop && dy > abs(dx) && !canChildScrollUp()) {
          dragging = true
          parent?.requestDisallowInterceptTouchEvent(true)
          return true
        }
      }
      MotionEvent.ACTION_CANCEL, MotionEvent.ACTION_UP -> dragging = false
    }
    return false
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (!refreshEnabled || isInteractionLocked()) return false
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        initialX = event.x
        initialY = event.y
        return true
      }
      MotionEvent.ACTION_MOVE -> {
        if (!dragging) {
          val dy = event.y - initialY
          if (dy > touchSlop && !canChildScrollUp()) dragging = true
        }
        if (dragging) {
          val rawDistance = max(0f, event.y - initialY - touchSlop)
          val resisted = min(maxPullDistancePx, rawDistance * dragRate.toFloat())
          setOffset(resisted)
          setPhase(if (resisted >= pullDistancePx) RefreshPhase.READY else RefreshPhase.PULLING)
        }
        return dragging
      }
      MotionEvent.ACTION_CANCEL -> {
        if (dragging) settleToIdle()
        dragging = false
        return true
      }
      MotionEvent.ACTION_UP -> {
        if (dragging) {
          if (offsetPx >= pullDistancePx) {
            beginRefreshing(true)
          } else {
            settleToIdle()
          }
        }
        dragging = false
        return true
      }
    }
    return super.onTouchEvent(event)
  }

  fun setRefreshingFromController(refreshing: Boolean) {
    post {
      if (refreshing) {
        beginRefreshing(false)
      } else if (!isResultPhase()) {
        settleToIdle()
      }
    }
  }

  fun beginRefreshFromController() {
    post { beginRefreshing(true) }
  }

  fun cancelRefreshFromController() {
    post { cancelCurrentAction() }
  }

  fun finishRefreshFromController(result: RefreshResult, resultDuration: Double) {
    post { finishRefreshing(result, resultDuration) }
  }

  fun pullToMaxFromController() {
    post { pullToMax() }
  }

  private fun beginRefreshing(notifyJs: Boolean): Boolean {
    if (!refreshEnabled || dragging || phase == RefreshPhase.REFRESHING) return false
    if (programmaticPull && phase != RefreshPhase.READY) return false

    cancelResultDismiss()
    programmaticPull = false
    setPhase(RefreshPhase.REFRESHING)
    animateOffsetTo(pullDistancePx)
    if (notifyJs) controller?.requestRefresh()
    return true
  }

  private fun finishRefreshing(result: RefreshResult, resultDuration: Double) {
    if (phase != RefreshPhase.REFRESHING) return

    cancelResultDismiss()
    programmaticPull = false
    setPhase(
      if (result == RefreshResult.SUCCESS) RefreshPhase.SUCCESS else RefreshPhase.FAILURE,
    )
    animateOffsetTo(pullDistancePx) {
      scheduleResultDismiss(resultDuration)
    }
  }

  private fun pullToMax() {
    if (!refreshEnabled || dragging) return
    if (phase != RefreshPhase.IDLE && phase != RefreshPhase.SETTLING) return

    cancelResultDismiss()
    programmaticPull = true
    setPhase(RefreshPhase.PULLING)
    animateOffsetTo(maxPullDistancePx) {
      if (programmaticPull && phase == RefreshPhase.PULLING) {
        setPhase(RefreshPhase.READY)
      }
    }
  }

  private fun cancelCurrentAction() {
    cancelResultDismiss()
    programmaticPull = false
    dragging = false
    settleToIdle()
  }

  private fun settleToIdle() {
    cancelResultDismiss()
    programmaticPull = false
    if (offsetPx == 0f && phase == RefreshPhase.IDLE) return
    setPhase(RefreshPhase.SETTLING)
    animateOffsetTo(0f) {
      setPhase(RefreshPhase.IDLE)
    }
  }

  private fun scheduleResultDismiss(resultDuration: Double) {
    cancelResultDismiss()
    val durationMs =
      if (resultDuration.isFinite()) resultDuration.coerceAtLeast(0.0).roundToLong() else 800L
    val runnable = Runnable {
      resultDismissRunnable = null
      if (isResultPhase()) settleToIdle()
    }
    resultDismissRunnable = runnable
    if (durationMs == 0L) {
      runnable.run()
    } else {
      postDelayed(runnable, durationMs)
    }
  }

  private fun cancelResultDismiss() {
    resultDismissRunnable?.let(::removeCallbacks)
    resultDismissRunnable = null
  }

  private fun animateOffsetTo(target: Float, completion: (() -> Unit)? = null) {
    animator?.cancel()
    if (abs(offsetPx - target) < 0.5f) {
      animator = null
      setOffset(target)
      completion?.invoke()
      return
    }

    animator = ValueAnimator.ofFloat(offsetPx, target).apply {
      duration = 220
      interpolator = DecelerateInterpolator()
      addUpdateListener { setOffset(it.animatedValue as Float) }
      addListener(object : AnimatorListenerAdapter() {
        private var cancelled = false

        override fun onAnimationCancel(animation: Animator) {
          cancelled = true
        }

        override fun onAnimationEnd(animation: Animator) {
          if (animator === animation) animator = null
          if (!cancelled) completion?.invoke()
        }
      })
      start()
    }
  }

  private fun setOffset(value: Float) {
    offsetPx = value.coerceIn(0f, maxPullDistancePx)
    if (childCount > 0) getChildAt(0).translationY = offsetPx
    emitPull()
  }

  private fun setPhase(next: RefreshPhase) {
    if (phase == next) return
    phase = next
    emitPull()
    controller?.notifyPhase(next)
  }

  private fun emitPull() {
    val offsetDp = PixelUtil.toDIPFromPixel(offsetPx).toDouble()
    val progress =
      if (pullDistanceDp == 0.0) 0.0 else (offsetDp / pullDistanceDp).coerceIn(0.0, 1.0)
    publishSnapshot(offsetDp)

    val reactContext = context as? ThemedReactContext ?: return
    UIManagerHelper.getEventDispatcher(reactContext)?.dispatchEvent(
      RefreshPullEvent(
        UIManagerHelper.getSurfaceId(this),
        id,
        offsetDp,
        progress,
        phase.name.lowercase(),
      ),
    )
  }

  private fun publishSnapshot(
    offsetDp: Double = PixelUtil.toDIPFromPixel(offsetPx).toDouble(),
  ) {
    controller?.updateSnapshot(
      phase,
      offsetDp,
      phase == RefreshPhase.REFRESHING,
    )
  }

  private fun isInteractionLocked(): Boolean =
    programmaticPull || phase == RefreshPhase.REFRESHING || isResultPhase()

  private fun isResultPhase(): Boolean =
    phase == RefreshPhase.SUCCESS || phase == RefreshPhase.FAILURE

  private fun canChildScrollUp(): Boolean {
    val child = if (childCount > 0) getChildAt(0) else null
    return child?.canScrollVertically(-1) ?: false
  }
}
