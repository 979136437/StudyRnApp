package com.margelo.nitro.logger

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfoProvider

/** React Native 自动链接入口；公开能力全部通过 Nitro HybridObject 暴露。 */
class NitroLoggerPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? = null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
    ReactModuleInfoProvider { HashMap() }

  companion object {
    init {
      NitroLoggerOnLoad.initializeNative()
    }
  }
}
