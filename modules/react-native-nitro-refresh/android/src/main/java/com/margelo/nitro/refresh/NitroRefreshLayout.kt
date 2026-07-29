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
 * React Native 的 ScrollView 会把 `refreshControl` 渲染为滚动内容外层的 ViewGroup，
 * 因而本类始终只管理一个滚动子视图。只有子视图已经到顶且手势主要向下时，
 * 容器才接管触摸序列；正常纵向滚动、点击和横向手势继续交给子视图处理。
 *
 * 连续位移通过 Fabric `topPull` 事件发送给 Reanimated，离散阶段及刷新请求则经
 * Nitro 控制器发送到 JS。两条通道分离可以避免拖拽期间逐帧触发 React 渲染。
 */
internal class NitroRefreshLayout(context: Context) : ViewGroup(context) {
  /** 禁用时立即取消当前刷新或下拉动画，并把内容恢复到原位。 */
  var refreshEnabled = true
    set(value) {
      field = value
      if (!value) settleToIdle()
    }
  /** 触发阈值和刷新保持高度，单位为 dp。 */
  var pullDistanceDp = 80.0

  /** 内容允许下移的最大距离，单位为 dp。 */
  var maxPullDistanceDp = 160.0

  /** 原始手指距离转换为内容位移时使用的阻尼系数。 */
  var dragRate = 0.5

  // touchSlop 用来过滤点击抖动，避免轻微移动被误判为下拉手势。
  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
  private var initialX = 0f
  private var initialY = 0f
  private var dragging = false
  private var offsetPx = 0f
  private var phase = RefreshPhase.IDLE
  private var controller: HybridRefreshController? = null
  private var animator: ValueAnimator? = null

  private val pullDistancePx: Float
    get() = PixelUtil.toPixelFromDIP(pullDistanceDp)
  private val maxPullDistancePx: Float
    get() = PixelUtil.toPixelFromDIP(maxPullDistanceDp)

  /**
   * 通过 JS 传入的 controllerId 查找对应 HybridObject。
   * 控制器和 Fabric 视图的创建顺序不固定，因此关联逻辑允许任意一端先创建。
   */
  fun attachController(controllerId: String) {
    controller?.detach(this)
    controller = HybridRefreshController.find(controllerId)
    controller?.attach(this)
  }

  override fun onDetachedFromWindow() {
    // Fabric 视图可能被回收；必须停止动画并释放双向关联，避免继续更新旧 viewTag。
    animator?.cancel()
    controller?.detach(this)
    controller = null
    super.onDetachedFromWindow()
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    // 作为 refreshControl 包装器，尺寸必须与外层滚动区域完全一致。
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
    if (!refreshEnabled || phase == RefreshPhase.REFRESHING || childCount == 0) {
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
        // 同时检查方向、系统触摸阈值和子视图顶部，尽量不干扰横向及普通滚动。
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
    if (!refreshEnabled) return false
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
          // 先扣除 touchSlop，再应用阻尼和最大距离，避免接管瞬间出现位置跳变。
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
          // 只有正常抬手且超过阈值才触发刷新；取消事件始终回弹。
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
    // Nitro 方法可能从任意线程调用，所有 View 状态修改统一投递到主线程。
    post {
      if (refreshing) beginRefreshing(false) else settleToIdle()
    }
  }

  private fun beginRefreshing(notifyJs: Boolean) {
    if (phase == RefreshPhase.REFRESHING) return
    setPhase(RefreshPhase.REFRESHING)
    // 超拉后回到固定保持高度；程序化刷新则从当前位置展开到该高度。
    animateOffsetTo(pullDistancePx)
    // 程序化 refreshing=true 不应再次触发 onRefresh，防止受控状态形成回路。
    if (notifyJs) controller?.requestRefresh()
  }

  private fun settleToIdle() {
    if (offsetPx == 0f && phase == RefreshPhase.IDLE) return
    setPhase(RefreshPhase.SETTLING)
    animateOffsetTo(0f) {
      setPhase(RefreshPhase.IDLE)
    }
  }

  private fun animateOffsetTo(target: Float, completion: (() -> Unit)? = null) {
    // 新命令会取代旧动画；被取消的动画不得执行旧 completion 并错误进入 idle。
    animator?.cancel()
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
          if (!cancelled) completion?.invoke()
        }
      })
      start()
    }
  }

  private fun setOffset(value: Float) {
    // 内部布局使用 px；发给 JS 前才转换为 dp，保持公共 API 与 RN 尺寸单位一致。
    offsetPx = value.coerceIn(0f, maxPullDistancePx)
    if (childCount > 0) getChildAt(0).translationY = offsetPx
    emitPull()
  }

  private fun setPhase(next: RefreshPhase) {
    if (phase == next) return
    phase = next
    controller?.notifyPhase(next)
    emitPull()
  }

  private fun emitPull() {
    val reactContext = context as? ThemedReactContext ?: return
    val offsetDp = PixelUtil.toDIPFromPixel(offsetPx.toDouble())
    val progress = if (pullDistanceDp == 0.0) 0.0 else (offsetDp / pullDistanceDp).coerceIn(0.0, 1.0)
    // 使用 surfaceId + viewTag 构造 Fabric 直接事件，以兼容多个 React Surface。
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

  private fun canChildScrollUp(): Boolean {
    // canScrollVertically(-1) 同时覆盖短内容、长列表以及不同 RN 滚动实现。
    val child = if (childCount > 0) getChildAt(0) else null
    return child?.canScrollVertically(-1) ?: false
  }
}
