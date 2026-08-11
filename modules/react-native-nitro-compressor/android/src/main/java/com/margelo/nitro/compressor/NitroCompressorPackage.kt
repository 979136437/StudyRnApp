package com.margelo.nitro.compressor

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

class NitroCompressorPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    CompressorContext.install(reactContext)
    return null
  }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
    ReactModuleInfoProvider { HashMap() }

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> {
    // HybridObject 没有传统 NativeModule，借包初始化阶段保存只读应用上下文。
    CompressorContext.install(reactContext)
    return emptyList()
  }

  companion object {
    init {
      NitroCompressorOnLoad.initializeNative()
    }
  }
}
