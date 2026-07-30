package com.margelo.nitro.recyclerlist

import java.lang.ref.WeakReference
import kotlin.math.max
import kotlin.math.min

internal class RecyclerTabCoordinatorState {
  private val offsets = HashMap<String, Double>()
  var collapseOffset: Double = 0.0
    private set

  fun update(tabKey: String, offset: Double, active: Boolean, collapseRange: Double) {
    offsets[tabKey] = max(0.0, offset)
    if (active) collapseOffset = min(max(0.0, collapseRange), max(0.0, offset))
  }

  fun targetOffset(tabKey: String, collapseRange: Double): Double {
    val collapsed = min(max(0.0, collapseRange), collapseOffset)
    val saved = offsets[tabKey] ?: 0.0
    return if (collapsed < collapseRange) collapsed else max(collapsed, saved)
  }
}

/** 用弱引用关联同一折叠 Tab 中的列表，并保存各页原生偏移。 */
internal object RecyclerTabCoordinatorRegistry {
  private val states = HashMap<String, RecyclerTabCoordinatorState>()
  private val lists = HashMap<String, MutableMap<String, WeakReference<HybridRecyclerListView>>>()

  @Synchronized
  fun register(list: HybridRecyclerListView) {
    if (list.tabCoordinatorId.isEmpty() || list.tabKey.isEmpty()) return
    lists.getOrPut(list.tabCoordinatorId) { HashMap() }[list.tabKey] = WeakReference(list)
    states.getOrPut(list.tabCoordinatorId) { RecyclerTabCoordinatorState() }
  }

  @Synchronized
  fun unregister(list: HybridRecyclerListView) {
    unregister(list.tabCoordinatorId, list.tabKey, list)
  }

  @Synchronized
  fun unregister(coordinatorId: String, tabKey: String, list: HybridRecyclerListView) {
    lists[coordinatorId]?.let { group ->
      if (group[tabKey]?.get() === list) group.remove(tabKey)
      if (group.isEmpty()) {
        lists.remove(coordinatorId)
        states.remove(coordinatorId)
      }
    }
  }

  @Synchronized
  fun update(list: HybridRecyclerListView, offset: Double) {
    if (list.tabCoordinatorId.isEmpty() || list.tabKey.isEmpty()) return
    states.getOrPut(list.tabCoordinatorId) { RecyclerTabCoordinatorState() }
      .update(list.tabKey, offset, list.tabActive, list.tabCollapseRange)
  }

  @Synchronized
  fun targetOffset(list: HybridRecyclerListView): Double =
    states[list.tabCoordinatorId]?.targetOffset(list.tabKey, list.tabCollapseRange) ?: 0.0
}
