package com.margelo.nitro.refresh

import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.NitroRefreshControlViewManagerDelegate
import com.facebook.react.viewmanagers.NitroRefreshControlViewManagerInterface

/**
 * `NitroRefreshControlView` 的 Fabric ViewManager。
 *
 * 实现 Codegen 生成的接口并返回 delegate，保证新架构通过类型化路径下发属性；
 * `@ReactProp` 同时保留 RN ViewManager 的属性元数据。
 */
internal class NitroRefreshControlManager :
  ViewGroupManager<NitroRefreshLayout>(),
  NitroRefreshControlViewManagerInterface<NitroRefreshLayout> {
  private val delegate =
    NitroRefreshControlViewManagerDelegate<NitroRefreshLayout, NitroRefreshControlManager>(this)

  override fun getDelegate(): ViewManagerDelegate<NitroRefreshLayout> = delegate

  override fun getName(): String = REACT_CLASS

  override fun createViewInstance(reactContext: ThemedReactContext): NitroRefreshLayout =
    NitroRefreshLayout(reactContext)

  @ReactProp(name = "controllerId")
  override fun setControllerId(view: NitroRefreshLayout, value: String?) {
    if (value != null) view.attachController(value)
  }

  @ReactProp(name = "enabled", defaultBoolean = true)
  override fun setEnabled(view: NitroRefreshLayout, value: Boolean) {
    view.refreshEnabled = value
  }

  @ReactProp(name = "threshold", defaultDouble = DEFAULT_HEADER_HEIGHT_DP)
  override fun setThreshold(view: NitroRefreshLayout, value: Double) {
    view.thresholdDp = value
  }

  @ReactProp(name = "headerHeight", defaultDouble = DEFAULT_HEADER_HEIGHT_DP)
  override fun setHeaderHeight(view: NitroRefreshLayout, value: Double) {
    view.headerHeightDp = value
  }

  @ReactProp(name = "limit", defaultDouble = DEFAULT_LIMIT_DP)
  override fun setLimit(view: NitroRefreshLayout, value: Double) {
    view.limitDp = value
  }

  @ReactProp(name = "dragRate", defaultDouble = DEFAULT_DRAG_RATE)
  override fun setDragRate(view: NitroRefreshLayout, value: Double) {
    view.dragRate = value
  }

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> =
    // Codegen 的 onPull 在 Android 事件系统中的原生名称为 topPull。
    MapBuilder.of("topPull", MapBuilder.of("registrationName", "onPull"))

  companion object {
    const val REACT_CLASS = "NitroRefreshControlView"
    private const val DEFAULT_HEADER_HEIGHT_DP = 80.0
    private const val DEFAULT_LIMIT_DP = DEFAULT_HEADER_HEIGHT_DP
    private const val DEFAULT_DRAG_RATE = 1.0
  }
}
