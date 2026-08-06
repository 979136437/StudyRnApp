package com.margelo.nitro.visibilityobserver

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager
import com.margelo.nitro.visibilityobserver.views.HybridVisibilityObserverViewManager

/** React Native 自动链接入口，只注册 Nitrogen 生成的 Hybrid ViewManager。 */
class NitroVisibilityObserverPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? = null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
    ReactModuleInfoProvider { HashMap() }

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = listOf(HybridVisibilityObserverViewManager())

  companion object {
    init {
      // 初始化函数自身幂等，Package 重建不会重复注册 JNI 类型。
      NitroVisibilityObserverOnLoad.initializeNative()
    }
  }
}
