import Foundation

final class RecyclerTabCoordinatorState {
  private var offsets: [String: Double] = [:]
  private(set) var collapseOffset: Double = 0

  func update(tabKey: String, offset: Double, active: Bool, collapseRange: Double) {
    offsets[tabKey] = max(0, offset)
    if active { collapseOffset = min(max(0, collapseRange), max(0, offset)) }
  }

  func targetOffset(tabKey: String, collapseRange: Double) -> Double {
    let collapsed = min(max(0, collapseRange), collapseOffset)
    let saved = offsets[tabKey] ?? 0
    return collapsed < collapseRange ? collapsed : max(collapsed, saved)
  }
}

private final class WeakRecyclerList {
  weak var value: HybridRecyclerListView?
  init(_ value: HybridRecyclerListView) { self.value = value }
}

/// 用弱引用关联折叠 Tab 内的列表，并保存各页偏移。
final class RecyclerTabCoordinatorRegistry {
  private static var states: [String: RecyclerTabCoordinatorState] = [:]
  private static var lists: [String: [String: WeakRecyclerList]] = [:]
  private static let lock = NSLock()

  static func register(_ list: HybridRecyclerListView) {
    guard !list.tabCoordinatorId.isEmpty, !list.tabKey.isEmpty else { return }
    lock.lock()
    lists[list.tabCoordinatorId, default: [:]][list.tabKey] = WeakRecyclerList(list)
    if states[list.tabCoordinatorId] == nil { states[list.tabCoordinatorId] = RecyclerTabCoordinatorState() }
    lock.unlock()
  }

  static func unregister(_ list: HybridRecyclerListView) {
    unregister(list, coordinatorId: list.tabCoordinatorId, tabKey: list.tabKey)
  }

  static func unregister(_ list: HybridRecyclerListView, coordinatorId: String, tabKey: String) {
    lock.lock()
    if lists[coordinatorId]?[tabKey]?.value === list {
      lists[coordinatorId]?.removeValue(forKey: tabKey)
    }
    if lists[coordinatorId]?.isEmpty == true {
      lists.removeValue(forKey: coordinatorId)
      states.removeValue(forKey: coordinatorId)
    }
    lock.unlock()
  }

  static func update(_ list: HybridRecyclerListView, offset: Double) {
    guard !list.tabCoordinatorId.isEmpty, !list.tabKey.isEmpty else { return }
    lock.lock()
    let state = states[list.tabCoordinatorId] ?? RecyclerTabCoordinatorState()
    states[list.tabCoordinatorId] = state
    state.update(tabKey: list.tabKey, offset: offset, active: list.tabActive, collapseRange: list.tabCollapseRange)
    lock.unlock()
  }

  static func targetOffset(for list: HybridRecyclerListView) -> Double {
    lock.lock()
    let target = states[list.tabCoordinatorId]?.targetOffset(tabKey: list.tabKey, collapseRange: list.tabCollapseRange) ?? 0
    lock.unlock()
    return target
  }
}
