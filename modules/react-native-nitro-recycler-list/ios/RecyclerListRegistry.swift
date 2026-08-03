import UIKit

final class WeakBox<T: AnyObject> {
  weak var value: T?
  init(_ value: T) { self.value = value }
}

enum RecyclerListRegistry {
  private static var lists: [String: WeakBox<HybridRecyclerListView>] = [:]
  private static var hosts: [String: [Int: WeakBox<HybridRecyclerCellHostView>]] = [:]
  private static let lock = NSLock()

  static func register(list: HybridRecyclerListView, id: String) {
    guard !id.isEmpty else { return }
    lock.lock()
    lists[id] = WeakBox(list)
    let pending = hosts[id]?.values.compactMap(\.value) ?? []
    lock.unlock()
    pending.forEach(list.attachHost)
  }

  static func unregister(list: HybridRecyclerListView, id: String) {
    lock.lock()
    if lists[id]?.value === list { lists.removeValue(forKey: id) }
    lock.unlock()
  }

  static func register(host: HybridRecyclerCellHostView) {
    guard !host.listId.isEmpty, host.slotId >= 0 else { return }
    lock.lock()
    var listHosts = hosts[host.listId] ?? [:]
    listHosts[Int(host.slotId)] = WeakBox(host)
    hosts[host.listId] = listHosts
    let list = lists[host.listId]?.value
    lock.unlock()
    list?.attachHost(host)
  }

  static func reconcile(host: HybridRecyclerCellHostView) {
    lock.lock()
    let slot = Int(host.slotId)
    let isRegistered = hosts[host.listId]?[slot]?.value === host
    let list = lists[host.listId]?.value
    lock.unlock()
    if isRegistered { list?.reconcileHost(host) }
  }

  static func unregister(host: HybridRecyclerCellHostView) {
    unregister(host: host, listId: host.listId, slotId: Int(host.slotId))
  }

  static func unregister(
    host: HybridRecyclerCellHostView,
    listId: String,
    slotId: Int
  ) {
    lock.lock()
    if hosts[listId]?[slotId]?.value === host {
      hosts[listId]?.removeValue(forKey: slotId)
    }
    let list = lists[listId]?.value
    lock.unlock()
    list?.detachHost(host, slot: slotId)
  }
}
