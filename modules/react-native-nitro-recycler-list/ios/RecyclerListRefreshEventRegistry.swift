import Foundation

@objc public protocol RecyclerListRefreshEventSink: AnyObject {
  func emitRefresh(
    phase: String,
    offset: Double,
    progress: Double,
    secondLevelPhase: String,
    secondLevelProgress: Double
  )
  func emitTabScroll(collapseOffset: Double)
}

private final class WeakRefreshEventSink {
  weak var value: RecyclerListRefreshEventSink?
  init(_ value: RecyclerListRefreshEventSink) { self.value = value }
}

/// 用 `listId` 将 Swift 列表与 Objective-C++ Fabric EventEmitter 配对。
@objc(NitroRecyclerListRefreshEventRegistry)
public final class RecyclerListRefreshEventRegistry: NSObject {
  private static var sources: [String: WeakRefreshEventSink] = [:]
  private static let lock = NSLock()

  @objc(registerSource:listId:)
  public static func register(source: RecyclerListRefreshEventSink, listId: String) {
    guard !listId.isEmpty else { return }
    lock.lock()
    sources[listId] = WeakRefreshEventSink(source)
    lock.unlock()
  }

  @objc(unregisterSource:listId:)
  public static func unregister(source: RecyclerListRefreshEventSink, listId: String) {
    lock.lock()
    if sources[listId]?.value === source { sources.removeValue(forKey: listId) }
    lock.unlock()
  }

  static func emit(listId: String, snapshot: RecyclerListRefreshSnapshot) {
    lock.lock()
    let source = sources[listId]?.value
    if source == nil { sources.removeValue(forKey: listId) }
    lock.unlock()
    source?.emitRefresh(
      phase: snapshot.phase.stringValue,
      offset: snapshot.offset,
      progress: snapshot.progress,
      secondLevelPhase: snapshot.secondLevelPhase.stringValue,
      secondLevelProgress: snapshot.secondLevelProgress
    )
  }

  static func emitTabScroll(listId: String, collapseOffset: Double) {
    lock.lock()
    let source = sources[listId]?.value
    if source == nil { sources.removeValue(forKey: listId) }
    lock.unlock()
    source?.emitTabScroll(collapseOffset: collapseOffset)
  }
}
