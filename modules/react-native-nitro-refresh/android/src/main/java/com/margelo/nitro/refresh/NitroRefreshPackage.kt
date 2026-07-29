package com.margelo.nitro.refresh

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

/**
 * React Native 自动链接入口。
 * 本模块没有传统 NativeModule，只注册 Fabric ViewManager；Nitro HybridObject 由
 * 生成的 JNI 注册函数提供，因此包加载时必须先加载 C++ 动态库。
 */
class NitroRefreshPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? = null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
    ReactModuleInfoProvider { HashMap() }

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = listOf(NitroRefreshControlManager())

  companion object {
    init {
      // 方法内部幂等，多次创建 Package 不会重复加载或注册本机库。
      NitroRefreshOnLoad.initializeNative()
    }
  }
}
