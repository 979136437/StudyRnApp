import NitroModules
import UIKit

final class RecyclerListContainer: UIView {
  let layout = RecyclerCollectionLayout()
  lazy var collectionView = UICollectionView(frame: .zero, collectionViewLayout: layout)

  override init(frame: CGRect) {
    super.init(frame: frame)
    clipsToBounds = true
    collectionView.backgroundColor = .clear
    collectionView.alwaysBounceVertical = true
    addSubview(collectionView)
  }

  required init?(coder: NSCoder) { nil }

  override func layoutSubviews() {
    super.layoutSubviews()
    collectionView.frame = bounds
  }
}

private final class RecyclerCoordinator: NSObject, UICollectionViewDataSource, UICollectionViewDelegate {
  weak var owner: HybridRecyclerListView?

  func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int {
    owner?.descriptors.count ?? 0
  }

  func collectionView(
    _ collectionView: UICollectionView,
    cellForItemAt indexPath: IndexPath
  ) -> UICollectionViewCell {
    guard let owner else { return UICollectionViewCell() }
    let descriptor = owner.descriptors[indexPath.item]
    let reuseId = "NitroRecyclerCell:\(descriptor.type)"
    collectionView.register(RecyclerCollectionCell.self, forCellWithReuseIdentifier: reuseId)
    let cell = collectionView.dequeueReusableCell(withReuseIdentifier: reuseId, for: indexPath) as! RecyclerCollectionCell
    owner.bind(cell: cell, index: indexPath.item)
    return cell
  }

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    owner?.didScroll()
  }

  func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
    owner?.didEndDragging()
  }
}

final class HybridRecyclerListView: HybridRecyclerListViewSpec, RecyclableView {
  let view = RecyclerListContainer()
  private let coordinator = RecyclerCoordinator()
  private var hosts: [Int: HybridRecyclerCellHostView] = [:]
  private var cells: [Int: WeakBox<RecyclerCollectionCell>] = [:]
  private var cellSlots = NSMapTable<RecyclerCollectionCell, NSNumber>.weakToStrongObjects()
  private var nextSlotId = 1
  private var previousListId = ""
  private var lastRange = VisibleRange(first: -1, last: -1)
  private var endReachedArmed = true
  private var previousDescriptorVersion = ""

  var listId: String = ""
  var descriptors: [ItemDescriptor] = []
  var layout: RecyclerLayout = .list
  var horizontal = false
  var numColumns: Double = 1
  var overscan: Double = 1
  var refreshing = false
  var refreshEnabled = false
  var refreshThreshold: Double = 80
  var endReachedThreshold: Double = 0.5
  var endReachedEnabled = false
  var onSlotsChanged: ([SlotBinding]) -> Void = { _ in }
  var onRefreshRequested: () -> Void = {}
  var onRefreshProgress: (NativeRefreshPhase, Double, Double) -> Void = { _, _, _ in }
  var onEndReached: () -> Void = {}
  var onVisibleRangeChanged: (VisibleRange) -> Void = { _ in }

  override init() {
    super.init()
    coordinator.owner = self
    view.collectionView.dataSource = coordinator
    view.collectionView.delegate = coordinator
    view.collectionView.register(RecyclerCollectionCell.self, forCellWithReuseIdentifier: "NitroRecyclerCell:default")
  }

  func afterUpdate() {
    if previousListId != listId {
      if !previousListId.isEmpty { RecyclerListRegistry.unregister(list: self, id: previousListId) }
      previousListId = listId
      RecyclerListRegistry.register(list: self, id: listId)
    }
    let descriptorVersion = descriptors.map(\.key).joined(separator: "\u{001F}")
    if descriptorVersion != previousDescriptorVersion {
      previousDescriptorVersion = descriptorVersion
      endReachedArmed = true
    }
    view.layout.descriptors = descriptors
    view.layout.mode = layout
    view.layout.columns = max(1, Int(numColumns))
    view.layout.horizontal = horizontal
    view.collectionView.alwaysBounceVertical = refreshEnabled && !horizontal
    view.collectionView.reloadData()
    updateRefreshing(animated: true)
  }

  func attachHost(_ host: HybridRecyclerCellHostView) {
    let slot = Int(host.slotId)
    hosts[slot] = host
    host.view.onSizeChanged = { [weak self, weak host] size in
      guard let self, let host else { return }
      try? self.updateMeasuredSize(key: host.itemKey, width: size.width, height: size.height)
    }
    if let cell = cells[slot]?.value { attach(host: host, to: cell) }
  }

  func detachHost(_ host: HybridRecyclerCellHostView) {
    hosts.removeValue(forKey: Int(host.slotId))
    host.view.removeFromSuperview()
  }

  func bind(cell: RecyclerCollectionCell, index: Int) {
    let slot: Int
    if let existing = cellSlots.object(forKey: cell) {
      slot = existing.intValue
    } else {
      slot = nextSlotId
      nextSlotId += 1
      cellSlots.setObject(NSNumber(value: slot), forKey: cell)
    }
    cell.slotId = slot
    cell.bindingIndex = index
    cells[slot] = WeakBox(cell)
    if let host = hosts[slot] { attach(host: host, to: cell) }
    DispatchQueue.main.async { [weak self] in self?.publishBindings() }
  }

  func didScroll() {
    let range = visibleRange()
    if range.first != lastRange.first || range.last != lastRange.last {
      lastRange = range
      onVisibleRangeChanged(range)
    }
    publishBindings()
    checkEndReached()

    guard refreshEnabled, !horizontal, !refreshing else { return }
    let pull = max(0, -(view.collectionView.contentOffset.y + view.collectionView.adjustedContentInset.top))
    let progress = min(1, pull / max(1, refreshThreshold))
    let phase: NativeRefreshPhase = pull >= refreshThreshold ? .ready : pull > 0 ? .pulling : .idle
    onRefreshProgress(phase, pull, progress)
  }

  func didEndDragging() {
    guard refreshEnabled, !refreshing, !horizontal else { return }
    let pull = max(0, -(view.collectionView.contentOffset.y + view.collectionView.adjustedContentInset.top))
    if pull >= refreshThreshold { onRefreshRequested() }
  }

  func scrollToOffset(offset: Double, animated: Bool) throws {
    let point = horizontal ? CGPoint(x: offset, y: 0) : CGPoint(x: 0, y: offset)
    view.collectionView.setContentOffset(point, animated: animated)
  }

  func scrollToIndex(index: Double, viewPosition: Double, animated: Bool) throws {
    let target = Int(index)
    guard descriptors.indices.contains(target) else {
      throw NSError(domain: "NitroRecyclerList", code: 1, userInfo: [NSLocalizedDescriptionKey: "scrollToIndex index out of bounds: \(target)"])
    }
    let position: UICollectionView.ScrollPosition = horizontal ? .left : .top
    view.collectionView.scrollToItem(at: IndexPath(item: target, section: 0), at: position, animated: animated)
  }

  func scrollToEnd(animated: Bool) throws {
    guard !descriptors.isEmpty else { return }
    let position: UICollectionView.ScrollPosition = horizontal ? .right : .bottom
    view.collectionView.scrollToItem(at: IndexPath(item: descriptors.count - 1, section: 0), at: position, animated: animated)
  }

  func getVisibleRange() throws -> VisibleRange { visibleRange() }

  func getState() throws -> RecyclerListState {
    let range = visibleRange()
    let offset = horizontal ? view.collectionView.contentOffset.x : view.collectionView.contentOffset.y
    let size = horizontal ? view.collectionView.contentSize.width : view.collectionView.contentSize.height
    return RecyclerListState(
      offset: offset,
      contentSize: size,
      firstVisibleIndex: range.first,
      lastVisibleIndex: range.last,
      refreshing: refreshing
    )
  }

  func retryEndReached() throws {
    endReachedArmed = true
    checkEndReached()
  }

  func updateMeasuredSize(key: String, width: Double, height: Double) throws {
    let size = CGSize(width: width, height: height)
    guard view.layout.measuredSizes[key] != size else { return }
    view.layout.measuredSizes[key] = size
    view.collectionView.collectionViewLayout.invalidateLayout()
  }

  func prepareForRecycle() {
    view.collectionView.setContentOffset(.zero, animated: false)
    hosts.removeAll()
    cells.removeAll()
    view.layout.measuredSizes.removeAll()
    endReachedArmed = true
  }

  func onDropView() {
    RecyclerListRegistry.unregister(list: self, id: listId)
    view.collectionView.dataSource = nil
    view.collectionView.delegate = nil
  }

  private func attach(host: HybridRecyclerCellHostView, to cell: RecyclerCollectionCell) {
    host.view.removeFromSuperview()
    cell.contentView.subviews.forEach { $0.removeFromSuperview() }
    host.view.frame = cell.contentView.bounds
    host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    cell.contentView.addSubview(host.view)
    host.view.isHidden = false
  }

  private func publishBindings() {
    let bindings = view.collectionView.visibleCells.compactMap { cell -> SlotBinding? in
      guard let cell = cell as? RecyclerCollectionCell,
            descriptors.indices.contains(cell.bindingIndex) else { return nil }
      let descriptor = descriptors[cell.bindingIndex]
      return SlotBinding(
        slotId: Double(cell.slotId),
        index: Double(cell.bindingIndex),
        itemKey: descriptor.key,
        itemType: descriptor.type
      )
    }.sorted { $0.index < $1.index }
    onSlotsChanged(bindings)
  }

  private func visibleRange() -> VisibleRange {
    let indices = view.collectionView.indexPathsForVisibleItems.map(\.item)
    return VisibleRange(
      first: Double(indices.min() ?? -1),
      last: Double(indices.max() ?? -1)
    )
  }

  private func checkEndReached() {
    guard endReachedEnabled, endReachedArmed, !descriptors.isEmpty else { return }
    let range = visibleRange()
    let viewportItems = max(1, range.last - range.first + 1)
    let remaining = Double(descriptors.count - 1) - range.last
    if remaining <= viewportItems * max(0, endReachedThreshold) {
      endReachedArmed = false
      onEndReached()
    }
  }

  private func updateRefreshing(animated: Bool) {
    let inset = refreshing && !horizontal ? CGFloat(refreshThreshold) : 0
    var contentInset = view.collectionView.contentInset
    guard contentInset.top != inset else { return }
    contentInset.top = inset
    let changes = {
      self.view.collectionView.contentInset = contentInset
      if self.refreshing {
        self.view.collectionView.contentOffset.y = -inset
        self.onRefreshProgress(.refreshing, inset, 1)
      } else {
        self.onRefreshProgress(.settling, 0, 0)
      }
    }
    if animated {
      UIView.animate(withDuration: 0.2, animations: changes)
    } else {
      changes()
    }
  }
}
