import Foundation
import NitroModules
import UIKit

private protocol VisibilityFrameObserver: AnyObject {
  func onFrame(timestampMs: Double)
}

/// 所有探针共享一个 CADisplayLink，避免长列表为每个元素创建独立显示链路。
private final class VisibilityFrameScheduler: NSObject {
  static let shared = VisibilityFrameScheduler()

  private let observers = NSHashTable<AnyObject>.weakObjects()
  private var displayLink: CADisplayLink?

  func add(_ observer: VisibilityFrameObserver) {
    observers.add(observer)
    guard displayLink == nil else { return }
    let link = CADisplayLink(target: self, selector: #selector(onDisplayLink(_:)))
    link.add(to: .main, forMode: .common)
    displayLink = link
  }

  func remove(_ observer: VisibilityFrameObserver) {
    observers.remove(observer)
    stopIfEmpty()
  }

  @objc private func onDisplayLink(_ link: CADisplayLink) {
    let entries = observers.allObjects.compactMap { $0 as? VisibilityFrameObserver }
    guard !entries.isEmpty else {
      stopIfEmpty()
      return
    }
    let timestampMs = link.timestamp * 1_000
    entries.forEach { $0.onFrame(timestampMs: timestampMs) }
  }

  private func stopIfEmpty() {
    guard observers.allObjects.isEmpty else { return }
    displayLink?.invalidate()
    displayLink = nil
  }
}

private final class VisibilityProbeView: UIView {
  var onWindowChange: (() -> Void)?

  override func didMoveToWindow() {
    super.didMoveToWindow()
    onWindowChange?()
  }
}

final class HybridVisibilityObserverView:
  HybridVisibilityObserverViewSpec,
  VisibilityFrameObserver
{
  private let probeView = VisibilityProbeView(frame: .zero)
  var view: UIView { probeView }

  var enabled = true
  var threshold = 0.5
  var minimumVisibleDurationMs = 0.0
  var measurementIntervalMs = 100.0
  private var visibilityChangeCallback: (NativeVisibilityChangeEvent) -> Void = { _ in }
  var onVisibilityChange: (NativeVisibilityChangeEvent) -> Void {
    get { visibilityChangeCallback }
    set {
      visibilityChangeCallback = newValue
      // 新回调必须收到当前初始状态，不能继承旧回调已经发布过的标记。
      hasPublished = false
    }
  }

  private var appActive = UIApplication.shared.applicationState == .active
  private var disposed = false
  private var hasPublished = false
  private var lastPublishedVisible = false
  private var pendingVisibleSinceMs: Double?
  private var lastMeasurementMs = -Double.infinity
  private var notificationTokens: [NSObjectProtocol] = []

  override init() {
    super.init()
    probeView.isUserInteractionEnabled = false
    probeView.backgroundColor = .clear
    probeView.onWindowChange = { [weak self] in
      guard let self else { return }
      self.updateRegistration()
      self.evaluate(nowMs: CACurrentMediaTime() * 1_000, force: true)
    }
    observeApplicationState()
  }

  func afterUpdate() {
    threshold = min(1, max(0, threshold))
    minimumVisibleDurationMs = max(0, minimumVisibleDurationMs)
    measurementIntervalMs = max(16, measurementIntervalMs)
    updateRegistration()
    evaluate(nowMs: CACurrentMediaTime() * 1_000, force: true)
  }

  func onFrame(timestampMs: Double) {
    evaluate(nowMs: timestampMs, force: false)
  }

  private func updateRegistration() {
    if !disposed && enabled && view.window != nil {
      VisibilityFrameScheduler.shared.add(self)
    } else {
      VisibilityFrameScheduler.shared.remove(self)
    }
  }

  private func evaluate(nowMs: Double, force: Bool) {
    if !force && nowMs - lastMeasurementMs < measurementIntervalMs { return }
    lastMeasurementMs = nowMs

    let ratio = calculateVisibleRatio()
    let candidateVisible = ratio > 0 && ratio >= threshold
    guard candidateVisible else {
      pendingVisibleSinceMs = nil
      publishIfChanged(isVisible: false, visibleRatio: ratio)
      return
    }

    if hasPublished && lastPublishedVisible { return }
    if minimumVisibleDurationMs == 0 ||
      pendingVisibleSinceMs.map({ nowMs - $0 >= minimumVisibleDurationMs }) == true
    {
      pendingVisibleSinceMs = nil
      publishIfChanged(isVisible: true, visibleRatio: ratio)
    } else if pendingVisibleSinceMs == nil {
      pendingVisibleSinceMs = nowMs
    }
  }

  private func calculateVisibleRatio() -> Double {
    guard enabled, appActive, let window = view.window,
      !view.isHidden, view.bounds.width > 0, view.bounds.height > 0
    else {
      return 0
    }

    var visibleRect = view.convert(view.bounds, to: window).intersection(window.bounds)
    var ancestor = view.superview
    while let current = ancestor {
      if current.isHidden || current.alpha <= 0.01 { return 0 }
      if current.clipsToBounds {
        visibleRect = visibleRect.intersection(current.convert(current.bounds, to: window))
      }
      if current === window { break }
      ancestor = current.superview
    }

    guard !visibleRect.isNull, !visibleRect.isEmpty else { return 0 }
    let totalArea = view.bounds.width * view.bounds.height
    guard totalArea > 0 else { return 0 }
    let visibleArea = visibleRect.width * visibleRect.height
    return min(1, max(0, Double(visibleArea / totalArea)))
  }

  private func publishIfChanged(isVisible: Bool, visibleRatio: Double) {
    if hasPublished && lastPublishedVisible == isVisible { return }
    hasPublished = true
    lastPublishedVisible = isVisible
    visibilityChangeCallback(
      NativeVisibilityChangeEvent(
        isVisible: isVisible,
        visibleRatio: visibleRatio
      )
    )
  }

  private func observeApplicationState() {
    let center = NotificationCenter.default
    notificationTokens.append(
      center.addObserver(
        forName: UIApplication.didBecomeActiveNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.setAppActive(true)
      }
    )
    notificationTokens.append(
      center.addObserver(
        forName: UIApplication.willResignActiveNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.setAppActive(false)
      }
    )
  }

  private func setAppActive(_ active: Bool) {
    appActive = active
    evaluate(nowMs: CACurrentMediaTime() * 1_000, force: true)
  }

  func onDropView() {
    dispose()
  }

  // Nitro 可主动释放 HybridObject，此入口与视图卸载共用同一套幂等清理。
  func dispose() {
    cleanupViewResources()
  }

  private func cleanupViewResources() {
    guard !disposed else { return }
    disposed = true
    VisibilityFrameScheduler.shared.remove(self)
    notificationTokens.forEach { NotificationCenter.default.removeObserver($0) }
    notificationTokens.removeAll()
    probeView.onWindowChange = nil
    pendingVisibleSinceMs = nil
  }

  deinit {
    cleanupViewResources()
  }
}
