import XCTest
@testable import NitroRecyclerList

final class RecyclerTabCoordinatorStateTests: XCTestCase {
  func testPartialCollapseSyncAndDeepOffsetRestore() {
    let state = RecyclerTabCoordinatorState()
    state.update(tabKey: "first", offset: 60, active: true, collapseRange: 180)
    state.update(tabKey: "second", offset: 320, active: false, collapseRange: 180)
    XCTAssertEqual(state.targetOffset(tabKey: "second", collapseRange: 180), 60)

    state.update(tabKey: "first", offset: 240, active: true, collapseRange: 180)
    XCTAssertEqual(state.targetOffset(tabKey: "second", collapseRange: 180), 320)
  }
}
