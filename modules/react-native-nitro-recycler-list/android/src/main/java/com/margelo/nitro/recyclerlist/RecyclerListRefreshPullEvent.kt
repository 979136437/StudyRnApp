package com.margelo.nitro.recyclerlist

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

/** 原生列表下拉过程的 Fabric 直接事件。 */
internal class RecyclerListRefreshPullEvent(
  surfaceId: Int,
  viewTag: Int,
  private val offset: Double,
  private val progress: Double,
  private val phase: String,
  private val secondLevelProgress: Double,
  private val secondLevelPhase: String,
) : Event<RecyclerListRefreshPullEvent>(surfaceId, viewTag) {
  override fun getEventName(): String = "topPull"

  override fun getEventData(): WritableMap = Arguments.createMap().apply {
    putDouble("offset", offset)
    putDouble("progress", progress)
    putString("phase", phase)
    putDouble("secondLevelProgress", secondLevelProgress)
    putString("secondLevelPhase", secondLevelPhase)
  }
}

/** 活动列表向共享折叠头发送的 Fabric 直接事件。 */
internal class RecyclerListTabScrollEvent(
  surfaceId: Int,
  viewTag: Int,
  private val collapseOffset: Double,
) : Event<RecyclerListTabScrollEvent>(surfaceId, viewTag) {
  override fun getEventName(): String = "topTabScroll"

  override fun getEventData(): WritableMap = Arguments.createMap().apply {
    putDouble("collapseOffset", collapseOffset)
  }
}
