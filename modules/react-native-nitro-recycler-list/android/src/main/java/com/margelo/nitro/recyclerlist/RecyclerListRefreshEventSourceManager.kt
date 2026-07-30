package com.margelo.nitro.recyclerlist

import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.RecyclerListRefreshEventSourceViewManagerDelegate
import com.facebook.react.viewmanagers.RecyclerListRefreshEventSourceViewManagerInterface
import com.facebook.react.uimanager.SimpleViewManager

/** `RecyclerListRefreshEventSourceView` 的 Fabric Codegen ViewManager。 */
internal class RecyclerListRefreshEventSourceManager :
  SimpleViewManager<RecyclerListRefreshEventSourceView>(),
  RecyclerListRefreshEventSourceViewManagerInterface<RecyclerListRefreshEventSourceView> {
  private val delegate =
    RecyclerListRefreshEventSourceViewManagerDelegate<RecyclerListRefreshEventSourceView, RecyclerListRefreshEventSourceManager>(this)

  override fun getDelegate(): ViewManagerDelegate<RecyclerListRefreshEventSourceView> = delegate

  override fun getName(): String = REACT_CLASS

  override fun createViewInstance(reactContext: ThemedReactContext): RecyclerListRefreshEventSourceView =
    RecyclerListRefreshEventSourceView(reactContext)

  @ReactProp(name = "listId")
  override fun setListId(view: RecyclerListRefreshEventSourceView, value: String?) {
    view.updateListId(value)
  }

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> =
    MapBuilder.builder<String, Any>()
      .put("topPull", MapBuilder.of("registrationName", "onPull"))
      .put("topTabScroll", MapBuilder.of("registrationName", "onTabScroll"))
      .build()

  companion object {
    const val REACT_CLASS = "RecyclerListRefreshEventSourceView"
  }
}
