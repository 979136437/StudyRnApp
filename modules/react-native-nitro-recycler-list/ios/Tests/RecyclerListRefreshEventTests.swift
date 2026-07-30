import XCTest
@testable import NitroRecyclerList

final class RecyclerListRefreshEventTests: XCTestCase {
  func testStateClampsValuesAndOnlyPublishesChangedPhases() {
    let state = RecyclerListRefreshEventState()
    var pulls: [RecyclerListRefreshSnapshot] = []
    var phases: [NativeRefreshPhase] = []

    state.publish(phase: .pulling, offset: -12, progress: 1.8, onPull: { pulls.append($0) }, onPhaseChanged: { phases.append($0) })
    state.publish(phase: .pulling, offset: 42, progress: 0.5, onPull: { pulls.append($0) }, onPhaseChanged: { phases.append($0) })
    state.publish(phase: .ready, offset: 80, progress: 1, onPull: { pulls.append($0) }, onPhaseChanged: { phases.append($0) })

    XCTAssertEqual(pulls.count, 3)
    XCTAssertEqual(pulls[0].offset, 0)
    XCTAssertEqual(pulls[0].progress, 1)
    XCTAssertEqual(phases, [.pulling, .ready])
  }

  func testRegistrySupportsReplacementAndUnregister() {
    let first = FakeRefreshEventSink()
    let second = FakeRefreshEventSink()
    let listId = "refresh-registry-test"
    let snapshot = RecyclerListRefreshSnapshot(phase: .pulling, offset: 20, progress: 0.25)

    RecyclerListRefreshEventRegistry.emit(listId: listId, snapshot: snapshot)
    RecyclerListRefreshEventRegistry.register(source: first, listId: listId)
    RecyclerListRefreshEventRegistry.emit(listId: listId, snapshot: snapshot)
    RecyclerListRefreshEventRegistry.register(source: second, listId: listId)
    RecyclerListRefreshEventRegistry.emit(listId: listId, snapshot: snapshot)
    RecyclerListRefreshEventRegistry.unregister(source: first, listId: listId)
    RecyclerListRefreshEventRegistry.emit(listId: listId, snapshot: snapshot)
    RecyclerListRefreshEventRegistry.unregister(source: second, listId: listId)
    RecyclerListRefreshEventRegistry.emit(listId: listId, snapshot: snapshot)

    XCTAssertEqual(first.events.count, 1)
    XCTAssertEqual(second.events.count, 2)
  }
}

private final class FakeRefreshEventSink: NSObject, RecyclerListRefreshEventSink {
  var events: [(String, Double, Double)] = []

  func emitRefresh(phase: String, offset: Double, progress: Double) {
    events.append((phase, offset, progress))
  }
}
