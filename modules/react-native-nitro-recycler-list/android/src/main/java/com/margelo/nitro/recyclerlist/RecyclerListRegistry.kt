package com.margelo.nitro.recyclerlist

import java.lang.ref.WeakReference

internal interface RecyclerListRefreshEventSink {
  val listId: String
  fun emitPull(snapshot: RecyclerListRefreshSnapshot)
  fun emitTabScroll(collapseOffset: Double)
}

internal object RecyclerListRegistry {
  private val lists = HashMap<String, WeakReference<HybridRecyclerListView>>()
  private val hosts = HashMap<String, MutableMap<Int, WeakReference<HybridRecyclerCellHostView>>>()
  private val refreshEventSources = HashMap<String, WeakReference<RecyclerListRefreshEventSink>>()

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

  @Synchronized
  fun registerRefreshEventSource(source: RecyclerListRefreshEventSink) {
    if (source.listId.isEmpty()) return
    refreshEventSources[source.listId] = WeakReference(source)
  }

  @Synchronized
  fun unregisterRefreshEventSource(source: RecyclerListRefreshEventSink) {
    if (refreshEventSources[source.listId]?.get() === source) {
      refreshEventSources.remove(source.listId)
    }
  }

  @Synchronized
  fun emitRefresh(listId: String, snapshot: RecyclerListRefreshSnapshot) {
    val source = refreshEventSources[listId]?.get()
    if (source == null) refreshEventSources.remove(listId) else source.emitPull(snapshot)
  }

  @Synchronized
  fun emitTabScroll(listId: String, collapseOffset: Double) {
    val source = refreshEventSources[listId]?.get()
    if (source == null) refreshEventSources.remove(listId) else source.emitTabScroll(collapseOffset)
  }
}
