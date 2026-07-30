package com.margelo.nitro.recyclerlist

import android.view.View
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.ThemedReactContext

/** 不参与布局和手势，只承载 Fabric 直接事件的原生视图。 */
internal class RecyclerListRefreshEventSourceView(
  private val reactContext: ThemedReactContext,
) : View(reactContext), RecyclerListRefreshEventSink {
  override var listId: String = ""
    private set

  fun updateListId(nextListId: String?) {
    val next = nextListId.orEmpty()
    if (next == listId) return
    RecyclerListRegistry.unregisterRefreshEventSource(this)
    listId = next
    if (isAttachedToWindow) RecyclerListRegistry.registerRefreshEventSource(this)
  }

  override fun emitPull(snapshot: RecyclerListRefreshSnapshot) {
    if (!isAttachedToWindow || id == NO_ID) return
    UIManagerHelper.getEventDispatcher(reactContext)?.dispatchEvent(
      RecyclerListRefreshPullEvent(
        UIManagerHelper.getSurfaceId(this),
        id,
        snapshot.offset,
        snapshot.progress,
        snapshot.phase.toJsValue(),
      ),
    )
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    RecyclerListRegistry.registerRefreshEventSource(this)
  }

  override fun onDetachedFromWindow() {
    RecyclerListRegistry.unregisterRefreshEventSource(this)
    super.onDetachedFromWindow()
  }
}

internal fun NativeRefreshPhase.toJsValue(): String = when (this) {
  NativeRefreshPhase.IDLE -> "idle"
  NativeRefreshPhase.PULLING -> "pulling"
  NativeRefreshPhase.READY -> "ready"
  NativeRefreshPhase.REFRESHING -> "refreshing"
  NativeRefreshPhase.SETTLING -> "settling"
}
