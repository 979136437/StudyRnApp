import UIKit

final class RecyclerCollectionLayout: UICollectionViewLayout {
  var descriptors: [ItemDescriptor] = [] { didSet { invalidateLayout() } }
  var measuredSizes: [String: CGSize] = [:] { didSet { invalidateLayout() } }
  var mode: RecyclerLayout = .list { didSet { invalidateLayout() } }
  var columns = 1 { didSet { invalidateLayout() } }
  var horizontal = false { didSet { invalidateLayout() } }

  private var attributes: [UICollectionViewLayoutAttributes] = []
  private var contentSize: CGSize = .zero

  override var collectionViewContentSize: CGSize { contentSize }

  override func prepare() {
    super.prepare()
    guard let collectionView else { return }
    attributes.removeAll(keepingCapacity: true)
    let width = max(1, collectionView.bounds.width)
    let height = max(1, collectionView.bounds.height)

    if horizontal {
      var x: CGFloat = 0
      for (index, descriptor) in descriptors.enumerated() {
        let size = measuredSizes[descriptor.key] ?? CGSize(width: descriptor.estimatedSize, height: height)
        let attribute = UICollectionViewLayoutAttributes(forCellWith: IndexPath(item: index, section: 0))
        attribute.frame = CGRect(x: x, y: 0, width: max(1, size.width), height: height)
        attributes.append(attribute)
        x += max(1, size.width)
      }
      contentSize = CGSize(width: x, height: height)
      return
    }

    let columnCount = max(1, columns)
    let columnWidth = width / CGFloat(columnCount)
    var columnBottoms = Array(repeating: CGFloat(0), count: columnCount)
    var rowColumn = 0
    var rowTop: CGFloat = 0
    var rowHeight: CGFloat = 0

    for (index, descriptor) in descriptors.enumerated() {
      let span = mode == .list ? columnCount : min(columnCount, max(1, Int(descriptor.span)))
      let itemHeight = max(1, measuredSizes[descriptor.key]?.height ?? descriptor.estimatedSize)
      let frame: CGRect

      if mode == .masonry {
        if span == columnCount {
          let y = columnBottoms.max() ?? 0
          frame = CGRect(x: 0, y: y, width: width, height: itemHeight)
          columnBottoms = Array(repeating: y + itemHeight, count: columnCount)
        } else {
          let start = shortestRange(columnBottoms, span: span)
          let y = columnBottoms[start..<(start + span)].max() ?? 0
          frame = CGRect(x: CGFloat(start) * columnWidth, y: y, width: CGFloat(span) * columnWidth, height: itemHeight)
          for column in start..<(start + span) { columnBottoms[column] = y + itemHeight }
        }
      } else {
        if rowColumn + span > columnCount {
          rowTop += rowHeight
          rowColumn = 0
          rowHeight = 0
        }
        frame = CGRect(
          x: CGFloat(rowColumn) * columnWidth,
          y: rowTop,
          width: CGFloat(span) * columnWidth,
          height: itemHeight
        )
        rowColumn += span
        rowHeight = max(rowHeight, itemHeight)
        if rowColumn == columnCount {
          rowTop += rowHeight
          rowColumn = 0
          rowHeight = 0
        }
        columnBottoms = Array(repeating: rowTop + rowHeight, count: columnCount)
      }

      let attribute = UICollectionViewLayoutAttributes(forCellWith: IndexPath(item: index, section: 0))
      attribute.frame = frame.integral
      attributes.append(attribute)
    }

    let bottom = mode == .masonry ? (columnBottoms.max() ?? 0) : rowTop + rowHeight
    contentSize = CGSize(width: width, height: max(bottom, height))
  }

  override func layoutAttributesForElements(in rect: CGRect) -> [UICollectionViewLayoutAttributes]? {
    guard let collectionView else { return attributes.filter { $0.frame.intersects(rect) } }
    let visible = attributes.filter { $0.frame.intersects(rect) }.map { $0.copy() as! UICollectionViewLayoutAttributes }
    let offsetY = collectionView.contentOffset.y + collectionView.adjustedContentInset.top
    var levelOffsets: [Int: CGFloat] = [:]

    for level in Set(descriptors.map { Int($0.stickyLevel) }.filter { $0 >= 0 }).sorted() {
      let candidates = attributes.filter {
        Int(descriptors[$0.indexPath.item].stickyLevel) == level && $0.frame.minY <= offsetY + (levelOffsets.values.reduce(0, +))
      }
      guard let current = candidates.last else { continue }
      let copied = current.copy() as! UICollectionViewLayoutAttributes
      let stackOffset = levelOffsets.values.reduce(0, +)
      let next = attributes.first {
        $0.indexPath.item > current.indexPath.item && Int(descriptors[$0.indexPath.item].stickyLevel) == level
      }
      copied.frame.origin.y = min(
        max(current.frame.minY, offsetY + stackOffset),
        (next?.frame.minY ?? .greatestFiniteMagnitude) - copied.frame.height
      )
      copied.zIndex = 10_000 + level
      levelOffsets[level] = copied.frame.height
      if let index = visible.firstIndex(where: { $0.indexPath == copied.indexPath }) {
        visible[index] = copied
      } else {
        visible.append(copied)
      }
    }
    return visible
  }

  override func layoutAttributesForItem(at indexPath: IndexPath) -> UICollectionViewLayoutAttributes? {
    attributes.first { $0.indexPath == indexPath }
  }

  override func shouldInvalidateLayout(forBoundsChange newBounds: CGRect) -> Bool {
    guard let collectionView else { return true }
    return newBounds.size != collectionView.bounds.size || descriptors.contains { $0.stickyLevel >= 0 }
  }

  private func shortestRange(_ values: [CGFloat], span: Int) -> Int {
    guard span < values.count else { return 0 }
    var bestStart = 0
    var bestHeight = CGFloat.greatestFiniteMagnitude
    for start in 0...(values.count - span) {
      let height = values[start..<(start + span)].max() ?? 0
      if height < bestHeight {
        bestHeight = height
        bestStart = start
      }
    }
    return bestStart
  }
}
