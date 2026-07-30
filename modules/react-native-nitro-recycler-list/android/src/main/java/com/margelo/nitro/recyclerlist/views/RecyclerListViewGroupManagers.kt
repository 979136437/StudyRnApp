package com.margelo.nitro.recyclerlist.views

import android.view.View
import com.facebook.react.uimanager.ReactStylesDiffMap
import com.facebook.react.uimanager.StateWrapper
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager
import com.margelo.nitro.R.id.associated_hybrid_view_tag
import com.margelo.nitro.recyclerlist.HybridRecyclerCellHostView
import com.margelo.nitro.recyclerlist.HybridRecyclerListView
import com.margelo.nitro.recyclerlist.RecyclerCellContainer
import com.margelo.nitro.recyclerlist.RecyclerListContainer

class RecyclerListViewGroupManager : ViewGroupManager<RecyclerListContainer>() {
  init {
    setupViewRecycling()
  }

  override fun getName() = "RecyclerListView"

  override fun createViewInstance(context: ThemedReactContext): RecyclerListContainer {
    val hybrid = HybridRecyclerListView(context)
    return hybrid.view.also { it.setTag(associated_hybrid_view_tag, hybrid) }
  }

  override fun updateState(view: RecyclerListContainer, props: ReactStylesDiffMap, state: StateWrapper): Any? {
    val hybrid = view.getTag(associated_hybrid_view_tag) as HybridRecyclerListView
    hybrid.beforeUpdate()
    HybridRecyclerListViewStateUpdater.updateViewProps(hybrid, state)
    hybrid.afterUpdate()
    return super.updateState(view, props, state)
  }

  override fun addView(parent: RecyclerListContainer, child: View, index: Int) {
    parent.addManagedChild(child, index)
  }

  override fun removeViewAt(parent: RecyclerListContainer, index: Int) {
    parent.removeManagedChild(index)
  }

  override fun getChildCount(parent: RecyclerListContainer): Int = parent.managedChildCount()
  override fun getChildAt(parent: RecyclerListContainer, index: Int): View? = parent.managedChildAt(index)

  override fun onDropViewInstance(view: RecyclerListContainer) {
    (view.getTag(associated_hybrid_view_tag) as? HybridRecyclerListView)?.onDropView()
    super.onDropViewInstance(view)
  }

  override fun prepareToRecycleView(context: ThemedReactContext, view: RecyclerListContainer): RecyclerListContainer? {
    super.prepareToRecycleView(context, view)
    val hybrid = view.getTag(associated_hybrid_view_tag) as? HybridRecyclerListView ?: return null
    hybrid.prepareForRecycle()
    return hybrid.view
  }
}

class RecyclerCellHostViewGroupManager : ViewGroupManager<RecyclerCellContainer>() {
  init {
    setupViewRecycling()
  }

  override fun getName() = "RecyclerCellHostView"

  override fun createViewInstance(context: ThemedReactContext): RecyclerCellContainer {
    val hybrid = HybridRecyclerCellHostView(context)
    return hybrid.view.also { it.setTag(associated_hybrid_view_tag, hybrid) }
  }

  override fun updateState(view: RecyclerCellContainer, props: ReactStylesDiffMap, state: StateWrapper): Any? {
    val hybrid = view.getTag(associated_hybrid_view_tag) as HybridRecyclerCellHostView
    hybrid.beforeUpdate()
    HybridRecyclerCellHostViewStateUpdater.updateViewProps(hybrid, state)
    hybrid.afterUpdate()
    return super.updateState(view, props, state)
  }

  override fun addView(parent: RecyclerCellContainer, child: View, index: Int) {
    (parent.getTag(associated_hybrid_view_tag) as HybridRecyclerCellHostView).addReactChild(child, index)
  }

  override fun removeViewAt(parent: RecyclerCellContainer, index: Int) {
    parent.getChildAt(index)?.let {
      (parent.getTag(associated_hybrid_view_tag) as HybridRecyclerCellHostView).removeReactChild(it)
    }
  }

  override fun getChildCount(parent: RecyclerCellContainer): Int = parent.childCount
  override fun getChildAt(parent: RecyclerCellContainer, index: Int): View? = parent.getChildAt(index)

  override fun onDropViewInstance(view: RecyclerCellContainer) {
    (view.getTag(associated_hybrid_view_tag) as? HybridRecyclerCellHostView)?.onDropView()
    super.onDropViewInstance(view)
  }

  override fun prepareToRecycleView(context: ThemedReactContext, view: RecyclerCellContainer): RecyclerCellContainer? {
    super.prepareToRecycleView(context, view)
    val hybrid = view.getTag(associated_hybrid_view_tag) as? HybridRecyclerCellHostView ?: return null
    hybrid.prepareForRecycle()
    return hybrid.view
  }
}
