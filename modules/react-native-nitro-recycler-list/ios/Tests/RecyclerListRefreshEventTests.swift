import XCTest
@testable import NitroRecyclerList

final class RecyclerListRefreshEventTests: XCTestCase {
  func testStateClampsValuesAndOnlyPublishesChangedPhases() {
    let state = RecyclerListRefreshEventState()
    var pulls: [RecyclerListRefreshSnapshot] = []
    var phases: [NativeRefreshPhase] = []
    var secondPhases: [NativeSecondLevelPhase] = []

    state.publish(phase: .pulling, offset: -12, progress: 1.8, secondLevelPhase: .idle, secondLevelProgress: 0, onPull: { pulls.append($0) }, onPhaseChanged: { phases.append($0) }, onSecondLevelPhaseChanged: { secondPhases.append($0) })
    state.publish(phase: .ready, offset: 120, progress: 1, secondLevelPhase: .pulling, secondLevelProgress: 0.4, onPull: { pulls.append($0) }, onPhaseChanged: { phases.append($0) }, onSecondLevelPhaseChanged: { secondPhases.append($0) })
    state.publish(phase: .ready, offset: 180, progress: 1, secondLevelPhase: .ready, secondLevelProgress: 1.8, onPull: { pulls.append($0) }, onPhaseChanged: { phases.append($0) }, onSecondLevelPhaseChanged: { secondPhases.append($0) })

    XCTAssertEqual(pulls.count, 3)
    XCTAssertEqual(pulls[0].offset, 0)
    XCTAssertEqual(pulls[0].progress, 1)
    XCTAssertEqual(phases, [.pulling, .ready])
    XCTAssertEqual(secondPhases, [.pulling, .ready])
    XCTAssertEqual(pulls.last?.secondLevelProgress, 1)
  }

  func testRegistrySupportsReplacementAndUnregister() {
    let first = FakeRefreshEventSink()
    let second = FakeRefreshEventSink()
    let listId = "refresh-registry-test"
    let snapshot = RecyclerListRefreshSnapshot(
      phase: .pulling,
      offset: 20,
      progress: 0.25,
      secondLevelPhase: .idle,
      secondLevelProgress: 0
    )

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
  var events: [(String, Double, Double, String, Double)] = []

  func emitRefresh(phase: String, offset: Double, progress: Double, secondLevelPhase: String, secondLevelProgress: Double) {
    events.append((phase, offset, progress, secondLevelPhase, secondLevelProgress))
  }

  func emitTabScroll(collapseOffset: Double) {}
}
