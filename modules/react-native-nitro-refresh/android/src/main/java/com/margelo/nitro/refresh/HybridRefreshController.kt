package com.margelo.nitro.refresh

import java.lang.ref.WeakReference
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Nitro HybridObject 的 Android 实现。
 *
 * 该对象保存 React 的受控刷新意图、离散回调和最新原生快照；实际手势、位移与动画由
 * [NitroRefreshLayout] 处理。逐帧快照只在原生对象之间传递，只有 JS 主动调用
 * [getState] 时才跨越 JSI。
 */
class HybridRefreshController : HybridRefreshControllerSpec() {
  override val id: String = UUID.randomUUID().toString()

  private var onRefresh: (() -> Unit)? = null
  private var onStateChange: ((RefreshPhase) -> Unit)? = null
  @Volatile private var requestedRefreshing = false
  @Volatile private var latestState =
    RefreshStateSnapshot(RefreshPhase.IDLE, 0.0, false)
  private var binding = WeakReference<NitroRefreshLayout>(null)

  init {
    // Fabric 视图可能晚于控制器挂载，先登记以支持视图随后通过 id 查找。
    controllers[id] = WeakReference(this)
  }

  override fun setOnRefresh(callback: () -> Unit) {
    // React Strict Mode 会执行 setup -> cleanup -> setup，重新登记可支持第二次 setup。
    controllers[id] = WeakReference(this)
    onRefresh = callback
  }

  override fun setOnStateChange(callback: (phase: RefreshPhase) -> Unit) {
    onStateChange = callback
  }

  override fun clearCallbacks() {
    onRefresh = null
    onStateChange = null
    controllers.computeIfPresent(id) { _, reference ->
      if (reference.get() === this) null else reference
    }
  }

  override fun beginRefresh() {
    binding.get()?.beginRefreshFromController()
  }

  override fun cancelRefresh() {
    requestedRefreshing = false
    binding.get()?.cancelRefreshFromController()
  }

  override fun finishRefresh(result: RefreshResult, resultDuration: Double) {
    requestedRefreshing = false
    binding.get()?.finishRefreshFromController(result, resultDuration)
  }

  override fun getState(): RefreshStateSnapshot = latestState

  override fun pullToMax() {
    binding.get()?.pullToMaxFromController()
  }

  override fun setRefreshing(refreshing: Boolean) {
    // 即使视图尚未挂载也保存意图，attach 时会立即补同步初始 refreshing=true。
    requestedRefreshing = refreshing
    binding.get()?.setRefreshingFromController(refreshing)
  }

  internal fun attach(view: NitroRefreshLayout) {
    binding = WeakReference(view)
    view.publishStateToController()
    view.setRefreshingFromController(requestedRefreshing)
  }

  internal fun detach(view: NitroRefreshLayout) {
    if (binding.get() === view) {
      binding.clear()
    }
  }

  internal fun requestRefresh() {
    // 用户手势和 beginRefresh 都先进入 refreshing，再通知 JS。
    requestedRefreshing = true
    onRefresh?.invoke()
  }

  internal fun notifyPhase(phase: RefreshPhase) {
    onStateChange?.invoke(phase)
  }

  internal fun updateSnapshot(phase: RefreshPhase, offset: Double, refreshing: Boolean) {
    latestState = RefreshStateSnapshot(phase, offset, refreshing)
  }

  companion object {
    /** 所有控制器的进程内弱引用索引，键与 Fabric 的 controllerId 属性一致。 */
    private val controllers = ConcurrentHashMap<String, WeakReference<HybridRefreshController>>()

    internal fun find(id: String): HybridRefreshController? {
      val controller = controllers[id]?.get()
      if (controller == null) {
        controllers.remove(id)
      }
      return controller
    }
  }
}
