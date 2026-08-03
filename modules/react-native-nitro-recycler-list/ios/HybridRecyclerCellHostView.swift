import NitroModules
import UIKit

final class HybridRecyclerCellHostView: HybridRecyclerCellHostViewSpec, RecyclableView {
  let view = RecyclerCellContainer()
  var listId: String = ""
  var slotId: Double = -1
  var itemKey: String = ""
  var itemType: String = "default"

  private var previousListId = ""
  private var previousSlotId = -1

  override init() {
    super.init()
    view.onComponentViewMounted = { [weak self] in
      guard let self else { return }
      RecyclerListRegistry.reconcile(host: self)
    }
  }

  func afterUpdate() {
    let nextSlotId = Int(slotId)
    guard previousListId != listId || previousSlotId != nextSlotId else { return }
    if !previousListId.isEmpty {
      RecyclerListRegistry.unregister(
        host: self,
        listId: previousListId,
        slotId: previousSlotId
      )
    }
    previousListId = listId
    previousSlotId = nextSlotId
    RecyclerListRegistry.register(host: self)
  }

  func prepareForRecycle() {
    RecyclerListRegistry.unregister(host: self)
    previousListId = ""
    previousSlotId = -1
    view.layer.removeAllAnimations()
    view.transform = .identity
    view.alpha = 1
    view.resignFirstResponder()
    listId = ""
    slotId = -1
    itemKey = ""
    itemType = "default"
  }

  func onDropView() {
    RecyclerListRegistry.unregister(host: self)
    view.onComponentViewMounted = nil
    view.removeFromSuperview()
  }
}
