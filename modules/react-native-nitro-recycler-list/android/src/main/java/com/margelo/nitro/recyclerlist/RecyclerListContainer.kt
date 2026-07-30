package com.margelo.nitro.recyclerlist

import android.content.Context
import android.view.View
import android.widget.FrameLayout
import androidx.recyclerview.widget.RecyclerView

class RecyclerListContainer(context: Context) : FrameLayout(context) {
  val recyclerView = RecyclerView(context)
  private val managedChildren = ArrayList<View>()

  init {
    clipChildren = true
    addView(
      recyclerView,
      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
    )
  }

  fun addManagedChild(child: View, index: Int = managedChildren.size) {
    if (!managedChildren.contains(child)) {
      managedChildren.add(index.coerceIn(0, managedChildren.size), child)
    }
    if (child.parent == null) {
      addView(child, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
      child.visibility = View.INVISIBLE
    }
  }

  fun removeManagedChild(index: Int): View? {
    if (index !in managedChildren.indices) return null
    val child = managedChildren.removeAt(index)
    (child.parent as? android.view.ViewGroup)?.removeView(child)
    return child
  }

  fun managedChildCount(): Int = managedChildren.size

  fun managedChildAt(index: Int): View? = managedChildren.getOrNull(index)
}
