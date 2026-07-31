package com.margelo.nitro.recyclerlist

import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import com.margelo.nitro.NitroModules
import com.margelo.nitro.views.RecyclableView

class HybridRecyclerCellHostView(
  context: Context = requireNotNull(NitroModules.applicationContext),
) : HybridRecyclerCellHostViewSpec(), RecyclableView {
  override val view = RecyclerCellContainer(context)

  override var listId: String = ""
  override var slotId: Double = -1.0
  override var itemKey: String = ""
  override var itemType: String = "default"

  private var previousListId = ""
  private var previousSlotId = -1

  override fun afterUpdate() {
    val nextSlotId = slotId.toInt()
    if (previousListId != listId || previousSlotId != nextSlotId) {
      if (previousListId.isNotEmpty()) RecyclerListRegistry.unregisterHost(this)
      previousListId = listId
      previousSlotId = nextSlotId
      RecyclerListRegistry.registerHost(this)
    }
  }

  fun addReactChild(child: View, index: Int) {
    (child.parent as? ViewGroup)?.removeView(child)
    view.addView(
      child,
      index.coerceIn(0, view.childCount),
      FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
      ),
    )
  }

  fun removeReactChild(child: View) {
    view.removeView(child)
  }

  override fun prepareForRecycle() {
    RecyclerListRegistry.unregisterHost(this)
    previousListId = ""
    previousSlotId = -1
    view.clearAnimation()
    view.translationX = 0f
    view.translationY = 0f
    view.alpha = 1f
    view.clearFocus()
    listId = ""
    slotId = -1.0
    itemKey = ""
    itemType = "default"
  }

  override fun onDropView() {
    RecyclerListRegistry.unregisterHost(this)
    (view.parent as? ViewGroup)?.removeView(view)
  }
}
