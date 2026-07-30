import Foundation
import NitroModules

/// Fabric 刷新视图暴露给 Nitro 控制器的最小命令接口。
/// 使用 class-only 协议以便注册表安全地持有弱引用。
@objc public protocol NitroRefreshViewBinding: AnyObject {
  func setRefreshingFromController(_ refreshing: Bool)
  func beginRefreshFromController()
  func cancelRefreshFromController()
  func finishRefreshFromController(_ result: String, resultDuration: Double)
  func pullToMaxFromController()
}

private final class WeakController {
  weak var value: HybridRefreshController?

  init(_ value: HybridRefreshController?) {
    self.value = value
  }
}

private final class WeakBinding {
  weak var value: (any NitroRefreshViewBinding)?

  init(_ value: (any NitroRefreshViewBinding)?) {
    self.value = value
  }
}

/// 连接 Nitro HybridObject 与 Fabric ComponentView 的进程内注册表。
@objc(NitroRefreshControllerRegistry)
public final class NitroRefreshControllerRegistry: NSObject {
  private static var controllers: [String: WeakController] = [:]
  private static var bindings: [String: WeakBinding] = [:]
  private static let lock = NSLock()

  fileprivate static func register(_ controller: HybridRefreshController) {
    lock.lock()
    controllers[controller.id] = WeakController(controller)
    let binding = bindings[controller.id]?.value
    lock.unlock()

    if let binding {
      controller.attach(binding)
    }
  }

  fileprivate static func unregister(_ controller: HybridRefreshController) {
    lock.lock()
    if controllers[controller.id]?.value === controller {
      controllers.removeValue(forKey: controller.id)
    }
    lock.unlock()
  }

  @objc(attachControllerId:binding:)
  public static func attach(controllerId: String, binding: any NitroRefreshViewBinding) {
    lock.lock()
    bindings[controllerId] = WeakBinding(binding)
    let controller = controllers[controllerId]?.value
    lock.unlock()
    controller?.attach(binding)
  }

  @objc(detachControllerId:binding:)
  public static func detach(controllerId: String, binding: any NitroRefreshViewBinding) {
    lock.lock()
    if bindings[controllerId]?.value === binding {
      bindings.removeValue(forKey: controllerId)
    }
    let controller = controllers[controllerId]?.value
    lock.unlock()
    controller?.detach(binding)
  }

  @objc(requestRefreshForControllerId:)
  public static func requestRefresh(controllerId: String) {
    controller(for: controllerId)?.requestRefresh()
  }

  @objc(notifyControllerId:phase:)
  public static func notify(controllerId: String, phase: String) {
    guard let phase = RefreshPhase(fromString: phase) else { return }
    controller(for: controllerId)?.notifyPhase(phase)
  }

  @objc(updateControllerId:phase:offset:refreshing:)
  public static func update(
    controllerId: String,
    phase: String,
    offset: Double,
    refreshing: Bool
  ) {
    guard let phase = RefreshPhase(fromString: phase) else { return }
    controller(for: controllerId)?.updateState(
      phase: phase,
      offset: offset,
      refreshing: refreshing
    )
  }

  private static func controller(for id: String) -> HybridRefreshController? {
    lock.lock()
    let controller = controllers[id]?.value
    if controller == nil {
      controllers.removeValue(forKey: id)
    }
    lock.unlock()
    return controller
  }
}

/// Nitro RefreshController 的 iOS 实现。
final class HybridRefreshController: HybridRefreshControllerSpec {
  let id = UUID().uuidString

  private var onRefresh: (() -> Void)?
  private var onStateChange: ((RefreshPhase) -> Void)?
  private weak var binding: (any NitroRefreshViewBinding)?
  private var requestedRefreshing = false
  private let stateLock = NSLock()
  private var latestPhase: RefreshPhase = .idle
  private var latestOffset = 0.0
  private var latestRefreshing = false

  override init() {
    super.init()
    NitroRefreshControllerRegistry.register(self)
  }

  func setOnRefresh(callback: @escaping () -> Void) throws {
    NitroRefreshControllerRegistry.register(self)
    onRefresh = callback
  }

  func setOnStateChange(callback: @escaping (RefreshPhase) -> Void) throws {
    onStateChange = callback
  }

  func clearCallbacks() throws {
    onRefresh = nil
    onStateChange = nil
    NitroRefreshControllerRegistry.unregister(self)
  }

  func beginRefresh() throws {
    DispatchQueue.main.async { [weak self] in
      self?.binding?.beginRefreshFromController()
    }
  }

  func cancelRefresh() throws {
    requestedRefreshing = false
    DispatchQueue.main.async { [weak self] in
      self?.binding?.cancelRefreshFromController()
    }
  }

  func finishRefresh(refreshResult: RefreshResult, resultDuration: Double) throws {
    requestedRefreshing = false
    DispatchQueue.main.async { [weak self] in
      self?.binding?.finishRefreshFromController(
        refreshResult.stringValue,
        resultDuration: resultDuration
      )
    }
  }

  func getState() throws -> RefreshStateSnapshot {
    stateLock.lock()
    let phase = latestPhase
    let offset = latestOffset
    let refreshing = latestRefreshing
    stateLock.unlock()
    return RefreshStateSnapshot(
      phase: phase,
      offset: offset,
      refreshing: refreshing
    )
  }

  func pullToMax() throws {
    DispatchQueue.main.async { [weak self] in
      self?.binding?.pullToMaxFromController()
    }
  }

  func setRefreshing(refreshing: Bool) throws {
    requestedRefreshing = refreshing
    DispatchQueue.main.async { [weak self] in
      self?.binding?.setRefreshingFromController(refreshing)
    }
  }

  fileprivate func attach(_ binding: any NitroRefreshViewBinding) {
    self.binding = binding
    DispatchQueue.main.async { [weak self, weak binding] in
      guard let self, let binding else { return }
      binding.setRefreshingFromController(self.requestedRefreshing)
    }
  }

  fileprivate func detach(_ binding: any NitroRefreshViewBinding) {
    if self.binding === binding {
      self.binding = nil
    }
  }

  fileprivate func requestRefresh() {
    requestedRefreshing = true
    onRefresh?()
  }

  fileprivate func notifyPhase(_ phase: RefreshPhase) {
    onStateChange?(phase)
  }

  fileprivate func updateState(
    phase: RefreshPhase,
    offset: Double,
    refreshing: Bool
  ) {
    stateLock.lock()
    latestPhase = phase
    latestOffset = offset
    latestRefreshing = refreshing
    stateLock.unlock()
  }
}
