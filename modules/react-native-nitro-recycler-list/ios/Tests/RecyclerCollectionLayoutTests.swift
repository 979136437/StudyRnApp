import XCTest
@testable import NitroRecyclerList

final class RecyclerCollectionLayoutTests: XCTestCase {
  func testMasonryPlacesItemsWithoutOverlap() {
    let layout = RecyclerCollectionLayout()
    layout.mode = .masonry
    layout.columns = 2
    layout.descriptors = [
      ItemDescriptor(key: "a", type: "card", span: 1, stickyLevel: -1, stickyGroup: "", estimatedSize: 100),
      ItemDescriptor(key: "b", type: "card", span: 1, stickyLevel: -1, stickyGroup: "", estimatedSize: 160),
      ItemDescriptor(key: "c", type: "card", span: 1, stickyLevel: -1, stickyGroup: "", estimatedSize: 80),
    ]
    let collectionView = UICollectionView(
      frame: CGRect(x: 0, y: 0, width: 320, height: 640),
      collectionViewLayout: layout
    )

    layout.prepare()
    let first = layout.layoutAttributesForItem(at: IndexPath(item: 0, section: 0))!.frame
    let second = layout.layoutAttributesForItem(at: IndexPath(item: 1, section: 0))!.frame
    let third = layout.layoutAttributesForItem(at: IndexPath(item: 2, section: 0))!.frame

    XCTAssertFalse(first.intersects(second))
    XCTAssertFalse(second.intersects(third))
    XCTAssertEqual(third.minX, first.minX)
    _ = collectionView
  }

  func testMasonryKeepsColumnAssignmentsAfterMeasurement() {
    let layout = RecyclerCollectionLayout()
    layout.mode = .masonry
    layout.columns = 2
    layout.descriptors = [
      ItemDescriptor(key: "a", type: "card", span: 1, stickyLevel: -1, stickyGroup: "", estimatedSize: 100),
      ItemDescriptor(key: "b", type: "card", span: 1, stickyLevel: -1, stickyGroup: "", estimatedSize: 100),
      ItemDescriptor(key: "c", type: "card", span: 1, stickyLevel: -1, stickyGroup: "", estimatedSize: 100),
    ]
    let collectionView = UICollectionView(
      frame: CGRect(x: 0, y: 0, width: 320, height: 640),
      collectionViewLayout: layout
    )

    layout.prepare()
    let initialX = layout.layoutAttributesForItem(at: IndexPath(item: 2, section: 0))!.frame.minX
    layout.measuredSizes["a"] = CGSize(width: 160, height: 240)
    layout.prepare()
    let measuredX = layout.layoutAttributesForItem(at: IndexPath(item: 2, section: 0))!.frame.minX

    XCTAssertEqual(measuredX, initialX)
    _ = collectionView
  }
}
