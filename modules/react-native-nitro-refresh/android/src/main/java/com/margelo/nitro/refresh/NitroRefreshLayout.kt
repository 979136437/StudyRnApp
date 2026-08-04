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

/**
 * Android 下拉刷新原生容器。
 *
 * 连续位移通过 Fabric 事件发送给 Reanimated，离散阶段及受控刷新意图通过 Nitro
 * 控制器传递。手势阻尼与回弹均在主线程内完成，不会逐帧调用 JavaScript。
 */
internal class NitroRefreshLayout(context: Context) : ViewGroup(context) {
  /** 禁用时立即取消当前刷新或下拉动画，并把内容恢复到原位。 */
  var refreshEnabled = true
    set(value) {
      field = value
      if (!value) cancelCurrentAction()
    }

  /** 触发刷新的可见下拉阈值，单位为 dp。 */
  var thresholdDp = DEFAULT_HEADER_HEIGHT_DP
    set(value) {
      field = value
      scheduleConfigurationUpdate()
    }

  /** 刷新中的内容保持高度，单位为 dp。 */
  var headerHeightDp = DEFAULT_HEADER_HEIGHT_DP
    set(value) {
      field = value
      scheduleConfigurationUpdate()
    }

  /** 内容允许下移的最大距离，单位为 dp。 */
  var limitDp = DEFAULT_LIMIT_DP
    set(value) {
      field = value
      scheduleConfigurationUpdate()
    }

  /** 可见下拉距离转换为触发进度时使用的灵敏度。 */
  var dragRate = DEFAULT_DRAG_RATE

  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
  private var initialX = 0f
  private var initialY = 0f
  private var dragging = false
  // 记录最近一次已接受的受控意图。它与 phase 分开保存，因为用户松手会先进入
  // Refreshing，随后 React 才会回传 refreshing=true；两者不能互相替代。
  private var controlledRefreshing = false
  private var offsetPx = 0f
  private var progress = 0f
  private var phase = RefreshPhase.IDLE
  private var controller: HybridRefreshController? = null
  private var animator: ValueAnimator? = null
  private val configurationUpdateRunnable = Runnable { applyConfigurationUpdate() }

  private val thresholdPx: Float
    get() = PixelUtil.toPixelFromDIP(thresholdDp)
  private val headerHeightPx: Float
    get() = PixelUtil.toPixelFromDIP(headerHeightDp)
  private val limitPx: Float
    get() =
      PixelUtil.toPixelFromDIP(
        max(
          max(limitDp, headerHeightDp),
          thresholdDp / dragRate.coerceAtLeast(MIN_DRAG_RATE),
        ),
      )

  fun attachController(controllerId: String) {
    controller?.detach(this)
    controller = HybridRefreshController.find(controllerId)
    controller?.attach(this)
  }

  override fun onDetachedFromWindow() {
    removeCallbacks(configurationUpdateRunnable)
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
          val visibleOffset = min(limitPx, rawDistance)
          val triggerOffset = min(limitPx, rawDistance * dragRate.toFloat())
          setOffset(visibleOffset, triggerOffset / thresholdPx)
          setPhase(
            if (triggerOffset >= thresholdPx) RefreshPhase.READY else RefreshPhase.PULLING,
          )
        }
        return dragging
      }
      MotionEvent.ACTION_CANCEL -> {
        val wasDragging = dragging
        dragging = false
        if (wasDragging) settleToIdle()
        return true
      }
      MotionEvent.ACTION_UP -> {
        val wasDragging = dragging
        // beginRefreshing 会拒绝仍在进行的拖拽；先结束手势，再处理松手结果。
        dragging = false
        if (wasDragging) {
          if (phase == RefreshPhase.READY) {
            beginRefreshing(true)
          } else {
            settleToIdle()
          }
        }
        return true
      }
    }
    return super.onTouchEvent(event)
  }

  fun setRefreshingFromController(refreshing: Boolean) {
    post {
      if (refreshing) {
        controlledRefreshing = true
        beginRefreshing(false)
      } else if (controlledRefreshing || phase == RefreshPhase.REFRESHING) {
        controlledRefreshing = false
        settleToIdle()
      }
    }
  }

  private fun beginRefreshing(notifyJs: Boolean): Boolean {
    if (!refreshEnabled || dragging || phase == RefreshPhase.REFRESHING) return false

    controlledRefreshing = true
    setPhase(RefreshPhase.REFRESHING)
    animateOffsetTo(headerHeightPx, 1f)
    if (notifyJs) controller?.requestRefresh()
    return true
  }

  private fun cancelCurrentAction() {
    controlledRefreshing = false
    dragging = false
    settleToIdle()
  }

  private fun settleToIdle() {
    if (offsetPx == 0f && phase == RefreshPhase.IDLE) return
    setPhase(RefreshPhase.SETTLING)
    animateOffsetTo(0f, decayProgress = true) {
      setPhase(RefreshPhase.IDLE)
    }
  }

  private fun scheduleConfigurationUpdate() {
    removeCallbacks(configurationUpdateRunnable)
    post(configurationUpdateRunnable)
  }

  private fun applyConfigurationUpdate() {
    when {
      phase == RefreshPhase.REFRESHING -> animateOffsetTo(headerHeightPx, 1f)
      offsetPx > limitPx -> setOffset(limitPx)
    }
  }

  private fun animateOffsetTo(
    target: Float,
    progressOverride: Float? = null,
    decayProgress: Boolean = false,
    completion: (() -> Unit)? = null,
  ) {
    animator?.cancel()
    if (abs(offsetPx - target) < OFFSET_EPSILON_PX) {
      animator = null
      setOffset(target, if (decayProgress) 0f else progressOverride)
      completion?.invoke()
      return
    }

    val startOffset = offsetPx
    val startProgress = progress
    animator = ValueAnimator.ofFloat(startOffset, target).apply {
      duration = REBOUND_DURATION_MS
      interpolator = DecelerateInterpolator()
      addUpdateListener {
        val animatedOffset = it.animatedValue as Float
        val animatedProgress =
          if (decayProgress && startOffset > 0f) {
            startProgress * (animatedOffset / startOffset)
          } else {
            progressOverride
          }
        setOffset(animatedOffset, animatedProgress)
      }
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

  private fun setOffset(value: Float, progressOverride: Float? = null) {
    offsetPx = value.coerceIn(0f, limitPx)
    val offsetDp = PixelUtil.toDIPFromPixel(offsetPx).toDouble()
    progress =
      progressOverride?.coerceIn(0f, 1f)
        ?: if (thresholdDp == 0.0) 0f else (offsetDp / thresholdDp).coerceIn(0.0, 1.0).toFloat()
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

    val reactContext = context as? ThemedReactContext ?: return
    UIManagerHelper.getEventDispatcher(reactContext)?.dispatchEvent(
      RefreshPullEvent(
        UIManagerHelper.getSurfaceId(this),
        id,
        offsetDp,
        progress.toDouble(),
        phase.name.lowercase(),
      ),
    )
  }

  private fun isInteractionLocked(): Boolean =
    phase == RefreshPhase.REFRESHING || phase == RefreshPhase.SETTLING

  private fun canChildScrollUp(): Boolean {
    val child = if (childCount > 0) getChildAt(0) else null
    return child?.let(::canViewScrollUp) ?: false
  }

  /**
   * FlashList 和部分复合列表会在 Fabric 宿主下再嵌套真正可滚动的原生子视图。
   * 逐层查找可向上滚动的可见节点，避免只检查外层 ViewGroup 时误判已经到顶。
   */
  private fun canViewScrollUp(view: View): Boolean {
    if (view.canScrollVertically(-1)) return true
    if (view !is ViewGroup) return false

    for (index in 0 until view.childCount) {
      val child = view.getChildAt(index)
      if (child.visibility == View.VISIBLE && canViewScrollUp(child)) return true
    }
    return false
  }

  companion object {
    private const val DEFAULT_HEADER_HEIGHT_DP = 80.0
    private const val DEFAULT_LIMIT_DP = 160.0
    private const val DEFAULT_DRAG_RATE = 1.0
    private const val MIN_DRAG_RATE = 0.01
    private const val REBOUND_DURATION_MS = 280L
    private const val OFFSET_EPSILON_PX = 0.5f
  }
}
