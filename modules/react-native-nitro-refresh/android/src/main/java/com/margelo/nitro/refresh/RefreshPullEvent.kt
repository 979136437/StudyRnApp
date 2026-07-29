package com.margelo.nitro.refresh

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

/**
 * 下拉过程的 Fabric 直接事件。
 *
 * offset/progress 高频变化并由 Reanimated 在 UI runtime 消费；phase 也随事件携带，
 * 使自定义刷新头无需等待 Nitro 的离散 JS 回调即可在同一帧更新视觉状态。
 */
internal class RefreshPullEvent(
  surfaceId: Int,
  viewTag: Int,
  private val offset: Double,
  private val progress: Double,
  private val phase: String,
) : Event<RefreshPullEvent>(surfaceId, viewTag) {
  override fun getEventName(): String = "topPull"

  override fun getEventData(): WritableMap = Arguments.createMap().apply {
    putDouble("offset", offset)
    putDouble("progress", progress)
    putString("phase", phase)
  }
}
