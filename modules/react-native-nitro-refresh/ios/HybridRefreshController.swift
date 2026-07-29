import Foundation
import NitroModules

/// Fabric 刷新视图暴露给 Nitro 控制器的最小命令接口。
/// 使用 class-only 协议以便注册表安全地持有弱引用。
@objc public protocol NitroRefreshViewBinding: AnyObject {
  func setRefreshingFromController(_ refreshing: Bool)
}

/// Swift 字典不能直接保存 weak 值，因此使用包装对象避免控制器被静态注册表保活。
private final class WeakController {
  weak var value: HybridRefreshController?

  init(_ value: HybridRefreshController?) {
    self.value = value
  }
}

/// 与 WeakController 相同，用于弱持有可被 Fabric 回收的 ComponentView。
private final class WeakBinding {
  weak var value: (any NitroRefreshViewBinding)?

  init(_ value: (any NitroRefreshViewBinding)?) {
    self.value = value
  }
}

///
/// 连接 Nitro HybridObject 与 Fabric ComponentView 的进程内注册表。
///
/// 两端创建顺序不固定：JS 可能先创建控制器，也可能 Fabric 先挂载视图。注册表分别
/// 暂存弱引用，在另一端出现时通过相同 controllerId 完成配对。所有字典访问由 NSLock
/// 保护，但 attach/detach 和 UIKit 命令均在解锁后执行，避免回调重入造成死锁。
///
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

    // 视图可能已经先挂载，此时立即补齐关联和初始受控状态。
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
    // 非法原生字符串不会穿过 JSI；生成的 fromString 保证与 Nitro 联合类型一致。
    guard let phase = RefreshPhase(fromString: phase) else { return }
    controller(for: controllerId)?.notifyPhase(phase)
  }

  private static func controller(for id: String) -> HybridRefreshController? {
    lock.lock()
    let controller = controllers[id]?.value
    // 查询时顺便清理已经释放的弱引用条目。
    if controller == nil {
      controllers.removeValue(forKey: id)
    }
    lock.unlock()
    return controller
  }
}

///
/// Nitro RefreshController 的 iOS 实现。
///
/// 控制器只负责受控状态、离散回调和 Fabric 视图关联；连续滚动数据留在主线程上的
/// ComponentView 内处理，避免每一帧跨 JSI。requestedRefreshing 会在视图尚未挂载时
/// 保留 React 的意图，并在 attach 后补同步。
///
final class HybridRefreshController: HybridRefreshControllerSpec {
  let id = UUID().uuidString

  private var onRefresh: (() -> Void)?
  private var onStateChange: ((RefreshPhase) -> Void)?
  private weak var binding: (any NitroRefreshViewBinding)?
  private var requestedRefreshing = false

  override init() {
    super.init()
    NitroRefreshControllerRegistry.register(self)
  }

  func setOnRefresh(callback: @escaping () -> Void) throws {
    // React Strict Mode 可能 cleanup 后再次 setup，重新注册以恢复同一实例的配对能力。
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

  func setRefreshing(refreshing: Bool) throws {
    requestedRefreshing = refreshing
    // Nitro 方法不保证从主线程进入，UIKit 命令必须显式切换到主队列。
    DispatchQueue.main.async { [weak self] in
      self?.binding?.setRefreshingFromController(refreshing)
    }
  }

  fileprivate func attach(_ binding: any NitroRefreshViewBinding) {
    self.binding = binding
    // 将初始 refreshing=true 或挂载前收到的最新状态立即应用到新视图。
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
    // 原生手势先锁定 refreshing，再通知 JS；结束时机由后续受控属性决定。
    requestedRefreshing = true
    onRefresh?()
  }

  fileprivate func notifyPhase(_ phase: RefreshPhase) {
    onStateChange?(phase)
  }
}
