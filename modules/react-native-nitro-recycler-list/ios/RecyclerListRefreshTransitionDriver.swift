import QuartzCore

/// 在 UIKit 属性动画期间同步生成可供 Fabric 发送的逐帧刷新位移。
final class RecyclerListRefreshTransitionDriver: NSObject {
  private var displayLink: CADisplayLink?
  private var startTime: CFTimeInterval = 0
  private var duration: CFTimeInterval = 0
  private var startValue: Double = 0
  private var targetValue: Double = 0
  private var onUpdate: ((Double) -> Void)?
  private var onCompletion: (() -> Void)?

  var isRunning: Bool { displayLink != nil }

  func start(
    from: Double,
    to: Double,
    duration: TimeInterval,
    onUpdate: @escaping (Double) -> Void,
    onCompletion: @escaping () -> Void
  ) {
    cancel()
    startValue = from
    targetValue = to
    self.duration = max(0.001, duration)
    startTime = CACurrentMediaTime()
    self.onUpdate = onUpdate
    self.onCompletion = onCompletion
    let link = CADisplayLink(target: self, selector: #selector(tick(_:)))
    displayLink = link
    link.add(to: .main, forMode: .common)
    onUpdate(from)
  }

  func cancel() {
    displayLink?.invalidate()
    displayLink = nil
    onUpdate = nil
    onCompletion = nil
  }

  @objc private func tick(_ link: CADisplayLink) {
    let linear = min(1, max(0, (link.timestamp - startTime) / duration))
    let eased = linear * linear * (3 - 2 * linear)
    onUpdate?(startValue + (targetValue - startValue) * eased)
    if linear >= 1 {
      let completion = onCompletion
      cancel()
      completion?()
    }
  }

  deinit {
    cancel()
  }
}
