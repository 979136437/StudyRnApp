package com.margelo.nitro.refresh

import java.lang.ref.WeakReference
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Nitro HybridObject 的 Android 实现。
 *
 * 该对象只保存 React 的受控刷新意图和离散回调；实际手势、连续位移与动画均由
 * [NitroRefreshLayout] 处理，避免在高频更新路径中维护 JS 不会读取的状态副本。
 */
class HybridRefreshController : HybridRefreshControllerSpec() {
  override val id: String = UUID.randomUUID().toString()

  private var onRefresh: (() -> Unit)? = null
  private var onStateChange: ((RefreshPhase) -> Unit)? = null
  @Volatile private var requestedRefreshing = false
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

  override fun setRefreshing(refreshing: Boolean) {
    // 即使视图尚未挂载也保存意图，attach 时会立即补同步初始 refreshing=true。
    requestedRefreshing = refreshing
    binding.get()?.setRefreshingFromController(refreshing)
  }

  internal fun attach(view: NitroRefreshLayout) {
    binding = WeakReference(view)
    view.setRefreshingFromController(requestedRefreshing)
  }

  internal fun detach(view: NitroRefreshLayout) {
    if (binding.get() === view) {
      binding.clear()
    }
  }

  internal fun requestRefresh() {
    // 用户手势先进入 refreshing，再通知 JS 回写受控属性。
    requestedRefreshing = true
    onRefresh?.invoke()
  }

  internal fun notifyPhase(phase: RefreshPhase) {
    onStateChange?.invoke(phase)
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
