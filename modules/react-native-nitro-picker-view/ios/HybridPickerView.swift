import Foundation
import NitroModules
import QuartzCore
import UIKit

private let defaultItemHeight: Double = 44
private let minimumItemHeight: Double = 24
private let maximumItemHeight: Double = 120
private let defaultMagnification: Double = 1.18
private let minimumMagnification: Double = 1
private let maximumMagnification: Double = 1.6
private let defaultFontSize: Double = 14
private let minimumFontSize: Double = 8
private let maximumFontSize: Double = 64
private let defaultFadeSize: Double = 72
private let maximumFadeSize: Double = 240
private let defaultFadeIntensity: Double = 0.9
private let snapTolerance: CGFloat = 0.5
private let deferredSelectionAlignmentPassCount: Int = 3

private extension Double {
  func finite(or fallback: Double) -> Double {
    isFinite ? self : fallback
  }
}

private func clamped<T: Comparable>(_ value: T, minimum: T, maximum: T) -> T {
  min(maximum, max(minimum, value))
}

private func parseColor(_ value: String) -> UIColor? {
  let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  guard !normalized.isEmpty else { return nil }

  let namedColors: [String: UIColor] = [
    "black": .black,
    "clear": .clear,
    "gray": .gray,
    "grey": .gray,
    "white": .white,
  ]
  if let color = namedColors[normalized] { return color }

  if normalized.hasPrefix("#") {
    let hex = String(normalized.dropFirst())
    let expanded: String
    switch hex.count {
    case 3:
      expanded = hex.map { "\($0)\($0)" }.joined() + "ff"
    case 6:
      expanded = hex + "ff"
    case 8:
      expanded = hex
    default:
      return nil
    }
    guard let number = UInt64(expanded, radix: 16) else { return nil }
    return UIColor(
      red: CGFloat((number >> 24) & 0xff) / 255,
      green: CGFloat((number >> 16) & 0xff) / 255,
      blue: CGFloat((number >> 8) & 0xff) / 255,
      alpha: CGFloat(number & 0xff) / 255
    )
  }

  guard let opening = normalized.firstIndex(of: "("), normalized.hasSuffix(")") else {
    return nil
  }
  let functionName = normalized[..<opening]
  guard functionName == "rgb" || functionName == "rgba" else { return nil }
  let components = normalized[normalized.index(after: opening)..<normalized.index(before: normalized.endIndex)]
    .split(separator: ",")
    .compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
  guard components.count == 3 || components.count == 4 else { return nil }
  return UIColor(
    red: CGFloat(clamped(components[0], minimum: 0, maximum: 255) / 255),
    green: CGFloat(clamped(components[1], minimum: 0, maximum: 255) / 255),
    blue: CGFloat(clamped(components[2], minimum: 0, maximum: 255) / 255),
    alpha: CGFloat(clamped(components.count == 4 ? components[3] : 1, minimum: 0, maximum: 1))
  )
}

private func blendedColor(
  from startColor: UIColor,
  to endColor: UIColor,
  progress: CGFloat,
  traits: UITraitCollection
) -> UIColor {
  let start = startColor.resolvedColor(with: traits)
  let end = endColor.resolvedColor(with: traits)
  var startRed: CGFloat = 0
  var startGreen: CGFloat = 0
  var startBlue: CGFloat = 0
  var startAlpha: CGFloat = 0
  var endRed: CGFloat = 0
  var endGreen: CGFloat = 0
  var endBlue: CGFloat = 0
  var endAlpha: CGFloat = 0
  guard
    start.getRed(&startRed, green: &startGreen, blue: &startBlue, alpha: &startAlpha),
    end.getRed(&endRed, green: &endGreen, blue: &endBlue, alpha: &endAlpha)
  else {
    return progress < 0.5 ? start : end
  }
  let fraction = clamped(progress, minimum: 0, maximum: 1)
  return UIColor(
    red: startRed + (endRed - startRed) * fraction,
    green: startGreen + (endGreen - startGreen) * fraction,
    blue: startBlue + (endBlue - startBlue) * fraction,
    alpha: startAlpha + (endAlpha - startAlpha) * fraction
  )
}

private final class PickerRowCell: UITableViewCell {
  static let reuseIdentifier = "NitroPickerRow"

  let pickerLabel = UILabel(frame: .zero)

  override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
    super.init(style: style, reuseIdentifier: reuseIdentifier)
    backgroundColor = .clear
    selectionStyle = .none
    clipsToBounds = false
    contentView.clipsToBounds = false
    pickerLabel.adjustsFontSizeToFitWidth = true
    pickerLabel.minimumScaleFactor = 0.75
    pickerLabel.textAlignment = .center
    pickerLabel.numberOfLines = 1
    pickerLabel.font = .systemFont(ofSize: CGFloat(defaultFontSize))
    contentView.addSubview(pickerLabel)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    pickerLabel.frame = contentView.bounds.insetBy(dx: 8, dy: 0)
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    pickerLabel.transform = .identity
    pickerLabel.alpha = 1
    pickerLabel.text = nil
  }
}

private protocol PickerColumnListener: AnyObject {
  func pickerColumnDidStart(_ column: Int)
  func pickerColumnDidSettle(_ column: Int, selectedIndex: Int)
}

private final class PickerColumnController: NSObject, UITableViewDataSource, UITableViewDelegate {
  let tableView = UITableView(frame: .zero, style: .plain)
  let columnIndex: Int
  weak var listener: PickerColumnListener?

  private(set) var items: [String] = []
  private var itemHeight: CGFloat = CGFloat(defaultItemHeight)
  private var fontSize: CGFloat = CGFloat(defaultFontSize)
  private var magnification: CGFloat = CGFloat(defaultMagnification)
  private var textColor = UIColor.label
  private var selectedTextColor = UIColor.label
  private var selectedIndex = 0
  private var viewportHeight: CGFloat = -1
  private var interactionActive = false
  private var snapping = false
  private var selectionLayoutPending = true
  private var deferredAlignmentDisplayLink: CADisplayLink?
  private var remainingDeferredAlignmentPasses = 0

  init(columnIndex: Int, listener: PickerColumnListener) {
    self.columnIndex = columnIndex
    self.listener = listener
    super.init()
    tableView.backgroundColor = .clear
    tableView.dataSource = self
    tableView.delegate = self
    tableView.separatorStyle = .none
    tableView.showsVerticalScrollIndicator = false
    tableView.alwaysBounceVertical = false
    tableView.contentInsetAdjustmentBehavior = .never
    // 组件使用固定行高；关闭 UITableView 估算可避免远距离初始定位和动态列刷新时
    // contentSize 逐步修正，从源头消除累计到半行的偏移。
    tableView.rowHeight = itemHeight
    tableView.estimatedRowHeight = 0
    tableView.estimatedSectionHeaderHeight = 0
    tableView.estimatedSectionFooterHeight = 0
    tableView.clipsToBounds = true
    tableView.register(PickerRowCell.self, forCellReuseIdentifier: PickerRowCell.reuseIdentifier)
  }

  func updateItems(_ nextItems: [String]) {
    guard items != nextItems else { return }
    items = nextItems
    selectedIndex = normalizeIndex(selectedIndex)
    tableView.reloadData()
    selectionLayoutPending = true
  }

  func updateVisuals(
    itemHeight: CGFloat,
    fontSize: CGFloat,
    magnification: CGFloat,
    textColor: UIColor,
    selectedTextColor: UIColor
  ) {
    let heightChanged = self.itemHeight != itemHeight
    self.itemHeight = itemHeight
    tableView.rowHeight = itemHeight
    self.fontSize = fontSize
    self.magnification = magnification
    self.textColor = textColor
    self.selectedTextColor = selectedTextColor
    if heightChanged {
      tableView.reloadData()
      selectionLayoutPending = true
      updateInsets()
      applySelection(selectedIndex)
    }
    updateVisibleRows()
  }

  func setDisabled(_ disabled: Bool) {
    tableView.isScrollEnabled = !disabled
    tableView.accessibilityTraits = disabled ? [.adjustable, .notEnabled] : [.adjustable]
  }

  func updateViewport() {
    guard tableView.bounds.height > 0 else { return }
    if viewportHeight != tableView.bounds.height {
      viewportHeight = tableView.bounds.height
      selectionLayoutPending = true
    }
    if selectionLayoutPending {
      applySelection(selectedIndex)
    } else {
      updateVisibleRows()
    }
  }

  func invalidateSelectionLayout() {
    cancelDeferredSelectionAlignment()
    selectionLayoutPending = true
  }

  func applySelection(_ index: Int) {
    cancelDeferredSelectionAlignment()
    selectedIndex = normalizeIndex(index)
    selectionLayoutPending = true
    guard tableView.bounds.height > 0 else { return }
    guard !items.isEmpty else {
      selectionLayoutPending = false
      return
    }
    alignSelection()
    scheduleDeferredSelectionAlignment()
  }

  private func alignSelection() {
    updateInsets()
    tableView.layoutIfNeeded()
    let offset = targetOffset(for: selectedIndex)
    tableView.setContentOffset(offset, animated: false)
    tableView.layoutIfNeeded()
    if abs(tableView.contentOffset.y - offset.y) > snapTolerance {
      tableView.setContentOffset(offset, animated: false)
    }
    selectionLayoutPending = false
    updateVisibleRows()
  }

  private func scheduleDeferredSelectionAlignment() {
    guard tableView.window != nil, !interactionActive else { return }
    remainingDeferredAlignmentPasses = deferredSelectionAlignmentPassCount
    let displayLink = CADisplayLink(
      target: self,
      selector: #selector(handleDeferredSelectionAlignment(_:))
    )
    deferredAlignmentDisplayLink = displayLink
    displayLink.add(to: .main, forMode: .common)
  }

  @objc private func handleDeferredSelectionAlignment(_ displayLink: CADisplayLink) {
    guard displayLink === deferredAlignmentDisplayLink else {
      displayLink.invalidate()
      return
    }
    guard tableView.window != nil, !interactionActive else {
      cancelDeferredSelectionAlignment()
      return
    }
    // UITableView 进入窗口后仍可能跨布局帧修正 contentSize；有限次复核可消除偶发首帧偏移。
    alignSelection()
    remainingDeferredAlignmentPasses -= 1
    if remainingDeferredAlignmentPasses <= 0 {
      cancelDeferredSelectionAlignment()
    }
  }

  private func cancelDeferredSelectionAlignment() {
    deferredAlignmentDisplayLink?.invalidate()
    deferredAlignmentDisplayLink = nil
    remainingDeferredAlignmentPasses = 0
  }

  func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
    items.count
  }

  func tableView(
    _ tableView: UITableView,
    cellForRowAt indexPath: IndexPath
  ) -> UITableViewCell {
    let cell = tableView.dequeueReusableCell(
      withIdentifier: PickerRowCell.reuseIdentifier,
      for: indexPath
    ) as! PickerRowCell
    cell.pickerLabel.text = items[indexPath.row]
    cell.pickerLabel.font = .systemFont(ofSize: fontSize)
    cell.accessibilityLabel = items[indexPath.row]
    return cell
  }

  func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
    cancelDeferredSelectionAlignment()
    snapping = false
    guard !interactionActive else { return }
    interactionActive = true
    listener?.pickerColumnDidStart(columnIndex)
  }

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    updateVisibleRows()
  }

  func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
    if !decelerate { snapToNearest() }
  }

  func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
    snapToNearest()
  }

  func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) {
    guard snapping else { return }
    finishInteraction(nearestIndex())
  }

  private func updateInsets() {
    let padding = max(0, (tableView.bounds.height - itemHeight) / 2)
    tableView.contentInset = UIEdgeInsets(top: padding, left: 0, bottom: padding, right: 0)
    tableView.scrollIndicatorInsets = tableView.contentInset
  }

  private func snapToNearest() {
    guard interactionActive else { return }
    guard !items.isEmpty else {
      finishInteraction(0)
      return
    }
    let target = nearestIndex()
    let offset = targetOffset(for: target)
    if abs(tableView.contentOffset.y - offset.y) <= snapTolerance {
      finishInteraction(target)
      return
    }
    snapping = true
    tableView.setContentOffset(offset, animated: true)
  }

  private func finishInteraction(_ index: Int) {
    snapping = false
    selectedIndex = normalizeIndex(index)
    applySelection(selectedIndex)
    guard interactionActive else { return }
    interactionActive = false
    listener?.pickerColumnDidSettle(columnIndex, selectedIndex: selectedIndex)
  }

  private func nearestIndex() -> Int {
    guard !items.isEmpty else { return 0 }
    let rawIndex = (tableView.contentOffset.y + tableView.contentInset.top) / max(1, itemHeight)
    return normalizeIndex(Int(rawIndex.rounded()))
  }

  private func targetOffset(for index: Int) -> CGPoint {
    CGPoint(x: 0, y: CGFloat(index) * itemHeight - tableView.contentInset.top)
  }

  private func normalizeIndex(_ index: Int) -> Int {
    items.isEmpty ? 0 : clamped(index, minimum: 0, maximum: items.count - 1)
  }

  private func updateVisibleRows() {
    guard tableView.bounds.height > 0 else { return }
    let viewportCenter = tableView.contentOffset.y + tableView.bounds.height / 2
    let influenceDistance = max(1, itemHeight * 2)
    for case let cell as PickerRowCell in tableView.visibleCells {
      let distance = abs(cell.center.y - viewportCenter)
      let progress = clamped(1 - distance / influenceDistance, minimum: 0, maximum: 1)
      // smoothstep 让项目越过中心线时保持一阶连续，避免放大效果出现顿挫。
      let eased = progress * progress * (3 - 2 * progress)
      let scale = 1 + (magnification - 1) * eased
      cell.pickerLabel.transform = CGAffineTransform(scaleX: scale, y: scale)
      cell.pickerLabel.alpha = 0.45 + 0.55 * eased
      cell.pickerLabel.font = .systemFont(ofSize: fontSize)
      cell.pickerLabel.textColor = blendedColor(
        from: textColor,
        to: selectedTextColor,
        progress: eased,
        traits: tableView.traitCollection
      )
    }
  }

  func refreshVisibleRows() {
    updateVisibleRows()
  }

  func dispose() {
    cancelDeferredSelectionAlignment()
    interactionActive = false
    snapping = false
    tableView.layer.removeAllAnimations()
    viewportHeight = -1
    tableView.delegate = nil
    tableView.dataSource = nil
    listener = nil
  }
}

private final class PickerRootView: UIView, PickerColumnListener {
  private let stackView = UIStackView(frame: .zero)
  private let topFadeLayer = CAGradientLayer()
  private let bottomFadeLayer = CAGradientLayer()
  private var columnControllers: [PickerColumnController] = []
  private var fadeColor = UIColor.systemBackground
  private var fadeSize: CGFloat = CGFloat(defaultFadeSize)
  private var fadeIntensity: CGFloat = CGFloat(defaultFadeIntensity)
  private var lastPropValue: [Int] = []
  private weak var ancestorScrollView: UIScrollView?

  var onStart: ((Int) -> Void)?
  var onSettled: ((Int, Int) -> Void)?

  override init(frame: CGRect) {
    super.init(frame: frame)
    clipsToBounds = true
    stackView.axis = .horizontal
    stackView.distribution = .fillEqually
    addSubview(stackView)
    layer.addSublayer(topFadeLayer)
    layer.addSublayer(bottomFadeLayer)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    stackView.frame = bounds
    // UIStackView 的 arranged subview 会延迟布局；先得到真实列尺寸再计算首帧 inset。
    stackView.setNeedsLayout()
    stackView.layoutIfNeeded()
    let size = min(fadeSize, bounds.height / 2)
    topFadeLayer.frame = CGRect(x: 0, y: 0, width: bounds.width, height: size)
    bottomFadeLayer.frame = CGRect(
      x: 0,
      y: bounds.height - size,
      width: bounds.width,
      height: size
    )
    columnControllers.forEach { $0.updateViewport() }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    configureNestedScrolling()
    guard window != nil else { return }
    columnControllers.forEach { $0.invalidateSelectionLayout() }
    setNeedsLayout()
  }

  override func didMoveToSuperview() {
    super.didMoveToSuperview()
    configureNestedScrolling()
  }

  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    updateGradientColors()
    columnControllers.forEach { $0.refreshVisibleRows() }
  }

  func update(
    columns: [[String]],
    value: [Int],
    disabled: Bool,
    itemHeight: CGFloat,
    fontSize: CGFloat,
    magnification: CGFloat,
    textColor: String,
    selectedTextColor: String,
    edgeFadeColor: String,
    edgeFadeSize: CGFloat,
    edgeFadeIntensity: CGFloat
  ) {
    ensureColumnCount(columns.count)
    let resolvedTextColor = parseColor(textColor) ?? .label
    let resolvedSelectedTextColor = parseColor(selectedTextColor) ?? resolvedTextColor
    for (index, items) in columns.enumerated() {
      let controller = columnControllers[index]
      let itemsChanged = controller.items != items
      controller.updateItems(items)
      controller.updateVisuals(
        itemHeight: itemHeight,
        fontSize: fontSize,
        magnification: magnification,
        textColor: resolvedTextColor,
        selectedTextColor: resolvedSelectedTextColor
      )
      controller.setDisabled(disabled)
      let nextValue = value.indices.contains(index) ? value[index] : 0
      if itemsChanged || !lastPropValue.indices.contains(index) || lastPropValue[index] != nextValue {
        controller.applySelection(nextValue)
      }
    }
    lastPropValue = value
    fadeColor = parseColor(edgeFadeColor) ?? .systemBackground
    fadeSize = edgeFadeSize
    fadeIntensity = edgeFadeIntensity
    updateGradientColors()
    setNeedsLayout()
  }

  private func ensureColumnCount(_ count: Int) {
    while columnControllers.count > count {
      let removed = columnControllers.removeLast()
      removed.dispose()
      stackView.removeArrangedSubview(removed.tableView)
      removed.tableView.removeFromSuperview()
    }
    while columnControllers.count < count {
      let controller = PickerColumnController(
        columnIndex: columnControllers.count,
        listener: self
      )
      columnControllers.append(controller)
      stackView.addArrangedSubview(controller.tableView)
    }
    configureNestedScrolling()
    if lastPropValue.count != count {
      lastPropValue = Array(lastPropValue.prefix(count))
    }
  }

  private func configureNestedScrolling() {
    var candidate = superview
    var resolvedAncestor: UIScrollView?
    while let current = candidate {
      if let scrollView = current as? UIScrollView {
        resolvedAncestor = scrollView
        break
      }
      candidate = current.superview
    }
    guard let resolvedAncestor else { return }
    ancestorScrollView = resolvedAncestor
    // 外层页面先等待命中的滚轮列判定，避免惯性手势被 React Native ScrollView 抢走。
    columnControllers.forEach {
      resolvedAncestor.panGestureRecognizer.require(
        toFail: $0.tableView.panGestureRecognizer
      )
    }
  }

  private func updateGradientColors() {
    let resolved = fadeColor.resolvedColor(with: traitCollection)
    let edge = resolved.withAlphaComponent(fadeIntensity).cgColor
    let clear = resolved.withAlphaComponent(0).cgColor
    topFadeLayer.colors = [edge, clear]
    topFadeLayer.startPoint = CGPoint(x: 0.5, y: 0)
    topFadeLayer.endPoint = CGPoint(x: 0.5, y: 1)
    bottomFadeLayer.colors = [clear, edge]
    bottomFadeLayer.startPoint = CGPoint(x: 0.5, y: 0)
    bottomFadeLayer.endPoint = CGPoint(x: 0.5, y: 1)
  }

  func pickerColumnDidStart(_ column: Int) {
    onStart?(column)
  }

  func pickerColumnDidSettle(_ column: Int, selectedIndex: Int) {
    onSettled?(column, selectedIndex)
  }

  func dispose() {
    columnControllers.forEach { $0.dispose() }
    columnControllers.removeAll()
    lastPropValue.removeAll()
    ancestorScrollView = nil
    stackView.arrangedSubviews.forEach { $0.removeFromSuperview() }
    topFadeLayer.removeFromSuperlayer()
    bottomFadeLayer.removeFromSuperlayer()
    onStart = nil
    onSettled = nil
  }
}

final class HybridPickerView: HybridPickerViewSpec {
  private let rootView = PickerRootView(frame: .zero)
  var view: UIView { rootView }

  var columns: [NativePickerColumn] = []
  var value: [Double] = []
  var disabled = false
  var itemHeight = defaultItemHeight
  var fontSize = defaultFontSize
  var magnification = defaultMagnification
  var textColor = ""
  var selectedTextColor = ""
  var edgeFadeColor = ""
  var edgeFadeSize = defaultFadeSize
  var edgeFadeIntensity = defaultFadeIntensity
  var onChange: (NativePickerEvent) -> Void = { _ in }
  var onPickStart: (NativePickerEvent) -> Void = { _ in }
  var onPickEnd: (NativePickerEvent) -> Void = { _ in }

  private var normalizedValue: [Int] = []
  private var disposed = false

  override init() {
    super.init()
    rootView.onStart = { [weak self] column in
      self?.handleStart(column)
    }
    rootView.onSettled = { [weak self] column, selectedIndex in
      self?.handleSettled(column, selectedIndex: selectedIndex)
    }
  }

  func afterUpdate() {
    guard !disposed else { return }
    let normalizedColumns = columns.map(\.items)
    normalizedValue = normalizedColumns.enumerated().map { index, items in
      guard !items.isEmpty else { return 0 }
      let candidate = value.indices.contains(index) ? value[index].finite(or: 0) : 0
      return clamped(Int(candidate), minimum: 0, maximum: items.count - 1)
    }
    let safeItemHeight = clamped(
      itemHeight.finite(or: defaultItemHeight),
      minimum: minimumItemHeight,
      maximum: maximumItemHeight
    )
    let safeFontSize = clamped(
      fontSize.finite(or: defaultFontSize),
      minimum: minimumFontSize,
      maximum: maximumFontSize
    )
    let safeMagnification = clamped(
      magnification.finite(or: defaultMagnification),
      minimum: minimumMagnification,
      maximum: maximumMagnification
    )
    let safeFadeSize = clamped(
      edgeFadeSize.finite(or: defaultFadeSize),
      minimum: 0,
      maximum: maximumFadeSize
    )
    let safeFadeIntensity = clamped(
      edgeFadeIntensity.finite(or: defaultFadeIntensity),
      minimum: 0,
      maximum: 1
    )
    rootView.update(
      columns: normalizedColumns,
      value: normalizedValue,
      disabled: disabled,
      itemHeight: CGFloat(safeItemHeight),
      fontSize: CGFloat(safeFontSize),
      magnification: CGFloat(safeMagnification),
      textColor: textColor,
      selectedTextColor: selectedTextColor,
      edgeFadeColor: edgeFadeColor,
      edgeFadeSize: CGFloat(safeFadeSize),
      edgeFadeIntensity: CGFloat(safeFadeIntensity)
    )
  }

  private func handleStart(_ column: Int) {
    guard !disposed, !disabled else { return }
    onPickStart(createEvent(column: column))
  }

  private func handleSettled(_ column: Int, selectedIndex: Int) {
    guard !disposed, !disabled, normalizedValue.indices.contains(column) else { return }
    normalizedValue[column] = selectedIndex
    let event = createEvent(column: column)
    onChange(event)
    onPickEnd(event)
  }

  private func createEvent(column: Int) -> NativePickerEvent {
    NativePickerEvent(
      value: normalizedValue.map(Double.init),
      column: Double(column)
    )
  }

  func onDropView() {
    dispose()
  }

  func dispose() {
    guard !disposed else { return }
    disposed = true
    rootView.dispose()
    onChange = { _ in }
    onPickStart = { _ in }
    onPickEnd = { _ in }
  }

  deinit {
    dispose()
  }
}
