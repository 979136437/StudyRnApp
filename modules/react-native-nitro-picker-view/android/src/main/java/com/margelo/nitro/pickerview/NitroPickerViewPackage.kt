package com.margelo.nitro.pickerview

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager
import com.margelo.nitro.pickerview.views.HybridPickerViewManager

/** React Native 自动链接入口，只注册 Nitrogen 生成的 Hybrid ViewManager。 */
class NitroPickerViewPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? = null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
    ReactModuleInfoProvider { HashMap() }

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = listOf(HybridPickerViewManager())

  companion object {
    init {
      NitroPickerViewOnLoad.initializeNative()
    }
  }
}
