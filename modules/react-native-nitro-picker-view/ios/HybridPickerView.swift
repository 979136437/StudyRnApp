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
private let defaultFadeSize: Double = 72
private let maximumFadeSize: Double = 240
private let defaultFadeIntensity: Double = 0.9
private let snapTolerance: CGFloat = 0.5

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
    pickerLabel.font = .systemFont(ofSize: 16)
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
  private var magnification: CGFloat = CGFloat(defaultMagnification)
  private var selectedIndex = 0
  private var viewportHeight: CGFloat = -1
  private var interactionActive = false
  private var snapping = false

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
    tableView.clipsToBounds = true
    tableView.register(PickerRowCell.self, forCellReuseIdentifier: PickerRowCell.reuseIdentifier)
  }

  func updateItems(_ nextItems: [String]) {
    guard items != nextItems else { return }
    items = nextItems
    selectedIndex = normalizeIndex(selectedIndex)
    tableView.reloadData()
  }

  func updateVisuals(itemHeight: CGFloat, magnification: CGFloat) {
    let heightChanged = self.itemHeight != itemHeight
    self.itemHeight = itemHeight
    self.magnification = magnification
    if heightChanged {
      tableView.reloadData()
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
    guard viewportHeight != tableView.bounds.height else { return }
    viewportHeight = tableView.bounds.height
    updateInsets()
    applySelection(selectedIndex)
  }

  func applySelection(_ index: Int) {
    selectedIndex = normalizeIndex(index)
    guard !items.isEmpty, tableView.bounds.height > 0 else { return }
    tableView.setContentOffset(targetOffset(for: selectedIndex), animated: false)
    updateVisibleRows()
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
    cell.accessibilityLabel = items[indexPath.row]
    return cell
  }

  func tableView(_ tableView: UITableView, heightForRowAt indexPath: IndexPath) -> CGFloat {
    itemHeight
  }

  func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
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
    if snapping { finishInteraction(nearestIndex()) }
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
      cell.pickerLabel.textColor = .label
    }
  }

  func dispose() {
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

  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    updateGradientColors()
  }

  func update(
    columns: [[String]],
    value: [Int],
    disabled: Bool,
    itemHeight: CGFloat,
    magnification: CGFloat,
    edgeFadeColor: String,
    edgeFadeSize: CGFloat,
    edgeFadeIntensity: CGFloat
  ) {
    ensureColumnCount(columns.count)
    for (index, items) in columns.enumerated() {
      let controller = columnControllers[index]
      let itemsChanged = controller.items != items
      controller.updateItems(items)
      controller.updateVisuals(itemHeight: itemHeight, magnification: magnification)
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
    if lastPropValue.count != count {
      lastPropValue = Array(lastPropValue.prefix(count))
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
  var magnification = defaultMagnification
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
      magnification: CGFloat(safeMagnification),
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
