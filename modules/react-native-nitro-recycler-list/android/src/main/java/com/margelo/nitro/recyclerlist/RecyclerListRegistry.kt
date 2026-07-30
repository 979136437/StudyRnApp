package com.margelo.nitro.recyclerlist

import java.lang.ref.WeakReference

internal object RecyclerListRegistry {
  private val lists = HashMap<String, WeakReference<HybridRecyclerListView>>()
  private val hosts = HashMap<String, MutableMap<Int, WeakReference<HybridRecyclerCellHostView>>>()

  @Synchronized
  fun registerList(id: String, list: HybridRecyclerListView) {
    if (id.isEmpty()) return
    lists[id] = WeakReference(list)
    hosts[id]?.values?.forEach { reference -> reference.get()?.let(list::attachHost) }
  }

  @Synchronized
  fun unregisterList(id: String, list: HybridRecyclerListView) {
    if (lists[id]?.get() === list) lists.remove(id)
  }

  @Synchronized
  fun registerHost(host: HybridRecyclerCellHostView) {
    if (host.listId.isEmpty() || host.slotId < 0) return
    hosts.getOrPut(host.listId) { HashMap() }[host.slotId.toInt()] = WeakReference(host)
    lists[host.listId]?.get()?.attachHost(host)
  }

  @Synchronized
  fun unregisterHost(host: HybridRecyclerCellHostView) {
    hosts[host.listId]?.remove(host.slotId.toInt())
    lists[host.listId]?.get()?.detachHost(host)
  }
}
