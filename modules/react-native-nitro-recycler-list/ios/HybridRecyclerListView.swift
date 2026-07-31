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
  private var previousLayoutVersion = ""
  private var previousTabCoordinatorId = ""
  private var previousTabKey = ""
  private var previousTabActive = false
  private let refreshEvents = RecyclerListRefreshEventState()
  private let refreshTransition = RecyclerListRefreshTransitionDriver()

  var listId: String = ""
  var descriptors: [ItemDescriptor] = []
  var layout: RecyclerLayout = .list
  var horizontal = false
  var numColumns: Double = 1
  var overscan: Double = 1
  var refreshing = false
  var refreshEnabled = false
  var refreshThreshold: Double = 80
  var secondLevelEnabled = false
  var secondLevelOpen = false
  var secondLevelThreshold: Double = 160
  var tabCoordinatorId = ""
  var tabKey = ""
  var tabActive = true
  var tabCollapseRange: Double = 0
  var endReachedThreshold: Double = 0.5
  var endReachedEnabled = false
  var onSlotsChanged: ([SlotBinding]) -> Void = { _ in }
  var onRefreshRequested: () -> Void = {}
  var onRefreshPhaseChanged: (NativeRefreshPhase) -> Void = { _ in }
  var onSecondLevelRequested: () -> Void = {}
  var onSecondLevelPhaseChanged: (NativeSecondLevelPhase) -> Void = { _ in }
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
      if !previousListId.isEmpty {
        publishRefresh(.idle, offset: 0, progress: 0, targetListId: previousListId)
        RecyclerListRegistry.unregister(list: self, id: previousListId)
      }
      previousListId = listId
      RecyclerListRegistry.register(list: self, id: listId)
    }
    let descriptorVersion = descriptors.map {
      "\($0.key):\($0.type):\($0.span):\($0.stickyGroup):\($0.stickyLevel):\($0.estimatedSize)"
    }.joined(separator: "\u{001F}")
    let layoutVersion = "\(layout):\(horizontal):\(max(1, Int(numColumns)))"
    if layoutVersion != previousLayoutVersion {
      previousLayoutVersion = layoutVersion
      view.layout.mode = layout
      view.layout.columns = max(1, Int(numColumns))
      view.layout.horizontal = horizontal
      view.layout.invalidateLayout()
    }
    if descriptorVersion != previousDescriptorVersion {
      previousDescriptorVersion = descriptorVersion
      endReachedArmed = true
      view.layout.descriptors = descriptors
      view.collectionView.reloadData()
    }
    view.collectionView.alwaysBounceVertical = refreshEnabled && !horizontal
    if tabCoordinatorId != previousTabCoordinatorId || tabKey != previousTabKey {
      if !previousTabCoordinatorId.isEmpty {
        RecyclerTabCoordinatorRegistry.unregister(
          self,
          coordinatorId: previousTabCoordinatorId,
          tabKey: previousTabKey
        )
      }
      previousTabCoordinatorId = tabCoordinatorId
      previousTabKey = tabKey
      RecyclerTabCoordinatorRegistry.register(self)
    }
    if tabActive && !previousTabActive && !tabCoordinatorId.isEmpty {
      try? scrollToOffset(offset: RecyclerTabCoordinatorRegistry.targetOffset(for: self), animated: false)
    }
    previousTabActive = tabActive
    if !refreshEnabled || horizontal || !tabActive {
      resetRefresh()
    } else if secondLevelEnabled && secondLevelOpen {
      updateSecondLevel(open: true)
    } else if refreshEvents.secondLevelPhase == .open || refreshEvents.secondLevelPhase == .opening {
      updateSecondLevel(open: false)
    } else {
      updateRefreshing(active: refreshing, animated: true)
    }
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
    publishTabScroll()

    if view.collectionView.isDragging && refreshTransition.isRunning {
      refreshTransition.cancel()
    }
    guard refreshEnabled, !horizontal, !refreshing, !secondLevelOpen, tabActive, !refreshTransition.isRunning else { return }
    let pull = max(0, -(view.collectionView.contentOffset.y + view.collectionView.adjustedContentInset.top))
    let progress = min(1, pull / max(1, refreshThreshold))
    let phase: NativeRefreshPhase = pull >= refreshThreshold ? .ready : pull > 0 ? .pulling : .idle
    let secondPhase: NativeSecondLevelPhase = secondLevelEnabled
      ? (pull >= secondLevelThreshold ? .ready : pull > refreshThreshold ? .pulling : .idle)
      : .idle
    let secondProgress = secondLevelEnabled
      ? min(1, max(0, (pull - refreshThreshold) / max(1, secondLevelThreshold - refreshThreshold)))
      : 0
    publishRefresh(
      phase,
      offset: pull,
      progress: progress,
      secondLevelPhase: secondPhase,
      secondLevelProgress: secondProgress
    )
  }

  func didEndDragging() {
    guard refreshEnabled, !refreshing, !horizontal, tabActive else { return }
    let pull = max(0, -(view.collectionView.contentOffset.y + view.collectionView.adjustedContentInset.top))
    if secondLevelEnabled && pull >= secondLevelThreshold {
      onSecondLevelRequested()
    } else if pull >= refreshThreshold {
      onRefreshRequested()
    }
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
      refreshing: refreshing,
      secondLevelOpen: refreshEvents.secondLevelPhase == .open,
      secondLevelPhase: refreshEvents.secondLevelPhase
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
    resetRefresh()
    RecyclerTabCoordinatorRegistry.unregister(self)
    view.collectionView.setContentOffset(.zero, animated: false)
    hosts.removeAll()
    cells.removeAll()
    view.layout.measuredSizes.removeAll()
    endReachedArmed = true
    previousDescriptorVersion = ""
    previousLayoutVersion = ""
  }

  func onDropView() {
    resetRefresh()
    RecyclerListRegistry.unregister(list: self, id: listId)
    RecyclerTabCoordinatorRegistry.unregister(self)
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

  private func updateRefreshing(active: Bool, animated: Bool) {
    let inset = active ? CGFloat(refreshThreshold) : 0
    var contentInset = view.collectionView.contentInset
    let targetPhase: NativeRefreshPhase = active ? .refreshing : .idle
    guard contentInset.top != inset else {
      publishRefresh(
        targetPhase,
        offset: Double(inset),
        progress: active ? 1 : 0
      )
      return
    }
    contentInset.top = inset
    let changes = {
      self.view.collectionView.contentInset = contentInset
      if active {
        self.view.collectionView.contentOffset.y = -inset
      }
    }
    if animated {
      let startOffset = refreshEvents.offset
      let transitionPhase: NativeRefreshPhase = active ? .refreshing : .settling
      UIView.animate(
        withDuration: 0.2,
        delay: 0,
        options: [.curveEaseInOut, .beginFromCurrentState],
        animations: changes
      )
      refreshTransition.start(
        from: startOffset,
        to: Double(inset),
        duration: 0.2,
        onUpdate: { [weak self] value in
          guard let self else { return }
          self.publishRefresh(
            transitionPhase,
            offset: value,
            progress: value / max(1, self.refreshThreshold)
          )
        },
        onCompletion: { [weak self] in
          guard let self else { return }
          self.publishRefresh(
            targetPhase,
            offset: Double(inset),
            progress: active ? 1 : 0
          )
        }
      )
    } else {
      changes()
      publishRefresh(targetPhase, offset: Double(inset), progress: active ? 1 : 0)
    }
  }

  private func updateSecondLevel(open: Bool) {
    if open && (refreshEvents.secondLevelPhase == .opening || refreshEvents.secondLevelPhase == .open) {
      return
    }
    if !open && (refreshEvents.secondLevelPhase == .closing || refreshEvents.secondLevelPhase == .idle) {
      return
    }
    refreshTransition.cancel()
    let collectionView = view.collectionView
    let start = Double(collectionView.transform.ty == 0 ? refreshEvents.offset : collectionView.transform.ty)
    let target = open ? Double(max(1, view.bounds.height)) : 0
    let transitionPhase: NativeSecondLevelPhase = open ? .opening : .closing
    if open && collectionView.transform.ty == 0 {
      collectionView.contentOffset.y = -collectionView.adjustedContentInset.top
      collectionView.transform = CGAffineTransform(translationX: 0, y: start)
    }
    collectionView.isScrollEnabled = false
    UIView.animate(
      withDuration: 0.26,
      delay: 0,
      options: [.curveEaseInOut, .beginFromCurrentState],
      animations: {
        collectionView.transform = CGAffineTransform(translationX: 0, y: target)
      }
    )
    refreshTransition.start(
      from: start,
      to: target,
      duration: 0.26,
      onUpdate: { [weak self] value in
        guard let self else { return }
        self.publishRefresh(
          .ready,
          offset: value,
          progress: 1,
          secondLevelPhase: transitionPhase,
          secondLevelProgress: 1
        )
      },
      onCompletion: { [weak self] in
        guard let self else { return }
        collectionView.transform = open
          ? CGAffineTransform(translationX: 0, y: target)
          : .identity
        collectionView.isScrollEnabled = !open
        self.publishRefresh(
          open ? .ready : .idle,
          offset: target,
          progress: open ? 1 : 0,
          secondLevelPhase: open ? .open : .idle,
          secondLevelProgress: open ? 1 : 0
        )
      }
    )
  }

  private func publishTabScroll() {
    guard tabActive, !tabCoordinatorId.isEmpty, !horizontal else { return }
    let offset = max(0, view.collectionView.contentOffset.y)
    RecyclerTabCoordinatorRegistry.update(self, offset: offset)
    RecyclerListRefreshEventRegistry.emitTabScroll(
      listId: listId,
      collapseOffset: min(max(0, tabCollapseRange), offset)
    )
  }

  private func publishRefresh(
    _ phase: NativeRefreshPhase,
    offset: Double,
    progress: Double,
    secondLevelPhase: NativeSecondLevelPhase = .idle,
    secondLevelProgress: Double = 0,
    targetListId: String? = nil
  ) {
    refreshEvents.publish(
      phase: phase,
      offset: offset,
      progress: progress,
      secondLevelPhase: secondLevelPhase,
      secondLevelProgress: secondLevelProgress,
      onPull: { snapshot in
        RecyclerListRefreshEventRegistry.emit(
          listId: targetListId ?? self.listId,
          snapshot: snapshot
        )
      },
      onPhaseChanged: { nextPhase in self.onRefreshPhaseChanged(nextPhase) },
      onSecondLevelPhaseChanged: { nextPhase in self.onSecondLevelPhaseChanged(nextPhase) }
    )
  }

  private func resetRefresh() {
    refreshTransition.cancel()
    var inset = view.collectionView.contentInset
    inset.top = 0
    view.collectionView.contentInset = inset
    view.collectionView.transform = .identity
    view.collectionView.isScrollEnabled = true
    publishRefresh(.idle, offset: 0, progress: 0)
  }
}
