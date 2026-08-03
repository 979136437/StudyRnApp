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
  private var lifecycleGeneration = 0
  private var pendingMeasuredSizes: [String: CGSize] = [:]
  private var previousBindingsSignature: String?
  private var nextBindingGeneration = 1
  private var bindingPublishPending = false
  private var measurementFlushPending = false
  private var isRecycling = false
  private var isDropped = false
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
    isRecycling = false
    if previousListId != listId {
      previousBindingsSignature = nil
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
    let layoutVersion = "\(layout):\(horizontal):\(max(1, Int(numColumns))):\(max(0, overscan))"
    if layoutVersion != previousLayoutVersion {
      previousLayoutVersion = layoutVersion
      view.layout.mode = layout
      view.layout.columns = max(1, Int(numColumns))
      view.layout.horizontal = horizontal
      view.layout.overscan = CGFloat(max(0, overscan))
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
    // `afterUpdate()` may run before Fabric has inserted this host into its React parent.
    // Defer native reparenting until the current component mounting transaction completes.
    scheduleHostAttachment(host)
  }

  private func scheduleHostAttachment(_ host: HybridRecyclerCellHostView) {
    let slot = Int(host.slotId)
    let generation = lifecycleGeneration
    DispatchQueue.main.async { [weak self, weak host] in
      guard let self, let host, generation == self.lifecycleGeneration,
            self.hosts[slot] === host else { return }
      self.attachHostIfManaged(host)
    }
  }

  private func attachHostIfManaged(_ host: HybridRecyclerCellHostView) {
    let slot = Int(host.slotId)
    guard let componentView = componentView(for: host),
          let parent = componentView.superview,
          hosts[slot] === host else { return }
    guard let cell = cells[slot]?.value else {
      componentView.isHidden = true
      return
    }
    guard isHostContentCurrent(host, in: cell) else {
      componentView.isHidden = true
      return
    }
    if parent === cell.contentView {
      componentView.isHidden = false
      return
    }
    attach(host: host, to: cell)
  }

  func reconcileHost(_ host: HybridRecyclerCellHostView) {
    let slot = Int(host.slotId)
    guard hosts[slot] === host else { return }
    guard let componentView = componentView(for: host),
          componentView.superview != nil else { return }
    guard let cell = cells[slot]?.value else {
      componentView.isHidden = true
      return
    }
    guard isHostContentCurrent(host, in: cell) else {
      componentView.isHidden = true
      return
    }
    guard componentView.superview !== cell.contentView else {
      componentView.isHidden = false
      return
    }
    componentView.isHidden = true
    scheduleHostAttachment(host)
  }

  func detachHost(_ host: HybridRecyclerCellHostView, slot: Int? = nil) {
    let slot = slot ?? Int(host.slotId)
    guard hosts[slot] === host else {
      removeHostViewIfOwned(host)
      return
    }
    hosts.removeValue(forKey: slot)
    removeHostViewIfOwned(host)
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
    cell.bindingGeneration = nextBindingGeneration
    nextBindingGeneration += 1
    cells[slot] = WeakBox(cell)
    if let host = hosts[slot] { attach(host: host, to: cell) }
    scheduleBindingsPublish()
  }

  func didScroll() {
    let range = visibleRange()
    if range.first != lastRange.first || range.last != lastRange.last {
      lastRange = range
      onVisibleRangeChanged(range)
    }
    scheduleBindingsPublish()
    checkEndReached()
    publishTabScroll()

    if view.collectionView.isDragging && refreshTransition.isRunning {
      refreshTransition.cancel()
    }
    guard refreshEnabled, !horizontal, !refreshing, !secondLevelOpen, tabActive, !refreshTransition.isRunning else { return }
    let rawPull = max(0, -(view.collectionView.contentOffset.y + view.collectionView.adjustedContentInset.top))
    let pullLimit = secondLevelEnabled ? secondLevelThreshold * 1.15 : refreshThreshold
    let pull = min(rawPull, pullLimit)
    if rawPull > pullLimit {
      view.collectionView.contentOffset.y = -view.collectionView.adjustedContentInset.top - pullLimit
    }
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
    let collectionView = view.collectionView
    collectionView.layoutIfNeeded()
    let indexPath = IndexPath(item: target, section: 0)
    guard let frame = view.layout.layoutAttributesForItem(at: indexPath)?.frame else { return }
    let position = CGFloat(min(1, max(0, viewPosition)))
    let leadingInset = horizontal
      ? collectionView.adjustedContentInset.left
      : collectionView.adjustedContentInset.top
    let trailingInset = horizontal
      ? collectionView.adjustedContentInset.right
      : collectionView.adjustedContentInset.bottom
    let viewportSize = horizontal
      ? collectionView.bounds.width - leadingInset - trailingInset
      : collectionView.bounds.height - leadingInset - trailingInset
    let itemSize = horizontal ? frame.width : frame.height
    let itemStart = horizontal ? frame.minX : frame.minY
    let minimumOffset = -leadingInset
    let contentSize = horizontal ? collectionView.contentSize.width : collectionView.contentSize.height
    let boundsSize = horizontal ? collectionView.bounds.width : collectionView.bounds.height
    let maximumOffset = max(minimumOffset, contentSize - boundsSize + trailingInset)
    let targetOffset = min(
      maximumOffset,
      max(minimumOffset, itemStart - leadingInset - (viewportSize - itemSize) * position)
    )
    let point = horizontal
      ? CGPoint(x: targetOffset, y: collectionView.contentOffset.y)
      : CGPoint(x: collectionView.contentOffset.x, y: targetOffset)
    collectionView.setContentOffset(point, animated: animated)
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
    guard width.isFinite, height.isFinite, width > 0, height > 0 else { return }
    let size = CGSize(width: width, height: height)
    let generation = lifecycleGeneration
    DispatchQueue.main.async { [weak self] in
      guard let self, !self.isDropped, !self.isRecycling,
            generation == self.lifecycleGeneration else { return }
      self.enqueueMeasuredSize(key: key, size: size)
    }
  }

  func prepareForRecycle() {
    lifecycleGeneration += 1
    isRecycling = true
    bindingPublishPending = false
    measurementFlushPending = false
    RecyclerListRegistry.unregister(list: self, id: previousListId.isEmpty ? listId : previousListId)
    resetRefresh()
    RecyclerTabCoordinatorRegistry.unregister(self)
    view.collectionView.setContentOffset(.zero, animated: false)
    hosts.removeAll()
    cells.removeAll()
    lastRange = VisibleRange(first: -1, last: -1)
    view.layout.measuredSizes.removeAll()
    pendingMeasuredSizes.removeAll()
    endReachedArmed = true
    previousListId = ""
    previousDescriptorVersion = ""
    previousLayoutVersion = ""
    previousTabCoordinatorId = ""
    previousTabKey = ""
    previousTabActive = false
    previousBindingsSignature = nil
    nextBindingGeneration = 1
  }

  func onDropView() {
    guard !isDropped else { return }
    isDropped = true
    lifecycleGeneration += 1
    bindingPublishPending = false
    measurementFlushPending = false
    pendingMeasuredSizes.removeAll()
    resetRefresh()
    RecyclerListRegistry.unregister(list: self, id: listId)
    RecyclerTabCoordinatorRegistry.unregister(self)
    view.collectionView.dataSource = nil
    view.collectionView.delegate = nil
  }

  private func attach(host: HybridRecyclerCellHostView, to cell: RecyclerCollectionCell) {
    guard let componentView = componentView(for: host) else { return }
    guard isHostContentCurrent(host, in: cell) else {
      componentView.isHidden = true
      return
    }
    componentView.isHidden = true
    componentView.removeFromSuperview()
    cell.contentView.subviews.forEach { $0.removeFromSuperview() }
    componentView.frame = cell.contentView.bounds
    componentView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    cell.contentView.addSubview(componentView)
    componentView.isHidden = false
    cell.setNeedsLayout()
  }

  private func isHostContentCurrent(
    _ host: HybridRecyclerCellHostView,
    in cell: RecyclerCollectionCell
  ) -> Bool {
    guard descriptors.indices.contains(cell.bindingIndex) else { return false }
    let descriptor = descriptors[cell.bindingIndex]
    return host.itemKey == descriptor.key && host.itemType == descriptor.type
  }

  private func removeHostViewIfOwned(_ host: HybridRecyclerCellHostView) {
    guard let componentView = componentView(for: host) else { return }
    let parent = componentView.superview
    let isOwnedCell = cells.values.contains { $0.value?.contentView === parent }
    if isOwnedCell { componentView.removeFromSuperview() }
  }

  private func componentView(for host: HybridRecyclerCellHostView) -> UIView? {
    let mountSelector = NSSelectorFromString("mountChildComponentView:index:")
    var candidate = host.view.superview
    while let current = candidate {
      if current.responds(to: mountSelector) { return current }
      candidate = current.superview
    }
    return nil
  }

  private func scheduleBindingsPublish() {
    guard !isDropped, !isRecycling, !bindingPublishPending else { return }
    bindingPublishPending = true
    let generation = lifecycleGeneration
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.bindingPublishPending = false
      guard !self.isDropped, !self.isRecycling,
            generation == self.lifecycleGeneration else { return }
      self.publishBindings()
    }
  }

  private func publishBindings() {
    var latestCells: [Int: RecyclerCollectionCell] = [:]
    for cell in cells.values.compactMap(\.value) where descriptors.indices.contains(cell.bindingIndex) {
      if let current = latestCells[cell.bindingIndex],
         current.bindingGeneration >= cell.bindingGeneration { continue }
      latestCells[cell.bindingIndex] = cell
    }
    let bindings = latestCells.values.compactMap { cell -> SlotBinding? in
      guard descriptors.indices.contains(cell.bindingIndex) else { return nil }
      let descriptor = descriptors[cell.bindingIndex]
      return SlotBinding(
        slotId: Double(cell.slotId),
        index: Double(cell.bindingIndex),
        itemKey: descriptor.key,
        itemType: descriptor.type
      )
    }.sorted { $0.slotId < $1.slotId }
    let signature = bindings.map {
      "\(Int($0.slotId)):\(Int($0.index)):\($0.itemKey):\($0.itemType)"
    }.joined(separator: ",")
    if signature == previousBindingsSignature { return }
    previousBindingsSignature = signature
    onSlotsChanged(bindings)
  }

  private func enqueueMeasuredSize(key: String, size: CGSize) {
    if view.layout.measuredSizes[key] == size && pendingMeasuredSizes[key] == nil { return }
    pendingMeasuredSizes[key] = size
    if measurementFlushPending { return }
    measurementFlushPending = true
    let generation = lifecycleGeneration
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.measurementFlushPending = false
      guard !self.isDropped, !self.isRecycling,
            generation == self.lifecycleGeneration else { return }
      self.flushMeasuredSizes()
    }
  }

  private func flushMeasuredSizes() {
    guard !pendingMeasuredSizes.isEmpty else { return }
    let batch = pendingMeasuredSizes
    pendingMeasuredSizes.removeAll(keepingCapacity: true)
    var measuredSizes = view.layout.measuredSizes
    var changed = false

    for (key, size) in batch {
      guard let descriptor = descriptors.first(where: { $0.key == key }),
            isMeasurementAccepted(descriptor: descriptor, size: size),
            measuredSizes[key] != size else { continue }
      measuredSizes[key] = size
      changed = true
    }
    guard changed else { return }

    let anchor = captureScrollAnchor()
    view.layout.measuredSizes = measuredSizes
    self.view.collectionView.collectionViewLayout.invalidateLayout()
    view.collectionView.layoutIfNeeded()
    restoreScrollAnchor(anchor)
    scheduleBindingsPublish()
  }

  private func isMeasurementAccepted(descriptor: ItemDescriptor, size: CGSize) -> Bool {
    let collectionView = view.collectionView
    let columnCount = max(1, Int(numColumns))
    let span = min(columnCount, max(1, Int(descriptor.span)))
    let crossAxisLimit = horizontal
      ? collectionView.bounds.height
      : collectionView.bounds.width * CGFloat(span) / CGFloat(columnCount)
    let crossAxisSize = horizontal ? size.height : size.width
    let primaryViewport = horizontal ? collectionView.bounds.width : collectionView.bounds.height
    let primarySize = horizontal ? size.width : size.height
    let estimated = CGFloat(max(1, descriptor.estimatedSize))
    let exceedsCrossAxis = crossAxisLimit > 0 && crossAxisSize > crossAxisLimit + 2
    let matchesViewportParkingSize = primaryViewport > 0 &&
      primarySize >= primaryViewport - 1 && estimated * 2 < primaryViewport
    return !exceedsCrossAxis && !matchesViewportParkingSize
  }

  private func captureScrollAnchor() -> (indexPath: IndexPath, distance: CGFloat)? {
    let collectionView = view.collectionView
    let viewportStart = horizontal
      ? collectionView.contentOffset.x + collectionView.adjustedContentInset.left
      : collectionView.contentOffset.y + collectionView.adjustedContentInset.top
    guard viewportStart > 0 else { return nil }
    let candidates = collectionView.indexPathsForVisibleItems.compactMap { indexPath -> (IndexPath, CGRect)? in
      guard let frame = view.layout.layoutAttributesForItem(at: indexPath)?.frame else { return nil }
      let frameEnd = horizontal ? frame.maxX : frame.maxY
      return frameEnd > viewportStart ? (indexPath, frame) : nil
    }
    guard let anchor = candidates.min(by: {
      let lhs = horizontal ? $0.1.minX : $0.1.minY
      let rhs = horizontal ? $1.1.minX : $1.1.minY
      return lhs < rhs
    }) else { return nil }
    let frameStart = horizontal ? anchor.1.minX : anchor.1.minY
    return (anchor.0, frameStart - viewportStart)
  }

  private func restoreScrollAnchor(_ anchor: (indexPath: IndexPath, distance: CGFloat)?) {
    guard let anchor,
          let frame = view.layout.layoutAttributesForItem(at: anchor.indexPath)?.frame else { return }
    let collectionView = view.collectionView
    if horizontal {
      let target = frame.minX - anchor.distance - collectionView.adjustedContentInset.left
      let maximum = max(-collectionView.adjustedContentInset.left,
                        collectionView.contentSize.width - collectionView.bounds.width + collectionView.adjustedContentInset.right)
      collectionView.contentOffset.x = min(max(-collectionView.adjustedContentInset.left, target), maximum)
    } else {
      let target = frame.minY - anchor.distance - collectionView.adjustedContentInset.top
      let maximum = max(-collectionView.adjustedContentInset.top,
                        collectionView.contentSize.height - collectionView.bounds.height + collectionView.adjustedContentInset.bottom)
      collectionView.contentOffset.y = min(max(-collectionView.adjustedContentInset.top, target), maximum)
    }
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
    if refreshTransition.target == Double(inset) { return }
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
        withDuration: 0.15,
        delay: 0,
        options: [.curveEaseInOut, .beginFromCurrentState],
        animations: changes
      )
      refreshTransition.start(
        from: startOffset,
        to: Double(inset),
        duration: 0.15,
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
