package com.margelo.nitro.recyclerlist

import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import kotlin.math.max

class RecyclerCellContainer(
  context: Context,
  private val fillChildren: Boolean = false,
) : FrameLayout(context) {
  private var preferredHorizontalInsets: Pair<Int, Int>? = null
  private val fillChildLayoutListener = View.OnLayoutChangeListener { child, _, _, _, _, _, _, _, _ ->
    if (fillChildren && child.parent === this) layoutChildWithinHolder(child)
  }

  init {
    clipChildren = true
    clipToPadding = true
    if (fillChildren) {
      setOnHierarchyChangeListener(object : ViewGroup.OnHierarchyChangeListener {
        override fun onChildViewAdded(parent: View?, child: View?) {
          child?.addOnLayoutChangeListener(fillChildLayoutListener)
        }

        override fun onChildViewRemoved(parent: View?, child: View?) {
          child?.removeOnLayoutChangeListener(fillChildLayoutListener)
          if (childCount == 0) preferredHorizontalInsets = null
        }
      })
    }
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    if (!fillChildren) {
      super.onLayout(changed, left, top, right, bottom)
      return
    }
    for (index in 0 until childCount) {
      layoutChildWithinHolder(getChildAt(index))
    }
  }

  private fun layoutChildWithinHolder(child: View) {
    if (width <= 0 || height <= 0) return
    val currentWidth = child.width
    val keepHorizontalBounds = currentWidth > 0 && child.left >= 0 && child.right <= width
    if (keepHorizontalBounds) {
      val leftInset = child.left
      val rightInset = width - child.right
      if (leftInset > 0 || rightInset > 0) {
        preferredHorizontalInsets = leftInset to rightInset
      }
    }
    val (leftInset, rightInset) = preferredHorizontalInsets ?: (0 to 0)
    val nextLeft = leftInset.coerceIn(0, max(0, width - 1))
    val nextWidth = max(1, width - nextLeft - rightInset.coerceAtLeast(0))
    val nextHeight = layoutParams?.height?.takeIf { it > 0 } ?: height
    if (child.left != nextLeft || child.top != 0 || child.width != nextWidth || child.height != nextHeight) {
      RecyclerTrace.log(
        this,
        "holder-child-corrected",
        "from=${child.left},${child.top},${child.width}x${child.height} to=$nextLeft,0,${nextWidth}x$nextHeight",
      )
      child.layout(nextLeft, 0, nextLeft + nextWidth, nextHeight)
    }
  }
}
