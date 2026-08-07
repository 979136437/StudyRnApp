package com.margelo.nitro.imagepicker

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager
import com.margelo.nitro.imagepicker.views.HybridMediaThumbnailManager

/** React Native 自动链接入口；公开能力全部通过 Nitro 暴露。 */
class NitroImagePickerPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? = null
  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider { HashMap() }
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    listOf(HybridMediaThumbnailManager())

  companion object {
    init { NitroImagePickerOnLoad.initializeNative() }
  }
}
