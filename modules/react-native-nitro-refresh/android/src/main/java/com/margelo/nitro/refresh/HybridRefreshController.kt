package com.margelo.nitro.refresh

import java.lang.ref.WeakReference
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Nitro HybridObject 的 Android 实现。
 *
 * 该对象保存 React 的受控刷新意图和离散回调；实际手势、位移与动画由
 * [NitroRefreshLayout] 处理。注册表使用 UUID 配对两者，并只持有弱引用，
 * 防止 Fabric 视图或 JS HostObject 卸载后被静态对象意外保活。
 */
class HybridRefreshController : HybridRefreshControllerSpec() {
  override val id: String = UUID.randomUUID().toString()

  private var onRefresh: (() -> Unit)? = null
  private var onStateChange: ((RefreshPhase) -> Unit)? = null
  private var requestedRefreshing = false
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
    // 仅删除仍指向当前实例的条目，避免极端情况下误删同 id 的新实例。
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
    // 原生手势先进入 refreshing，再通知 JS；父组件随后通过受控属性决定何时结束。
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
      // 顺便清理已被 GC 回收的陈旧条目。
      val controller = controllers[id]?.get()
      if (controller == null) {
        controllers.remove(id)
      }
      return controller
    }
  }
}
