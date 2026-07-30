package com.margelo.nitro.recyclerlist

import android.content.Context
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.recyclerview.widget.StaggeredGridLayoutManager
import com.margelo.nitro.NitroModules
import com.margelo.nitro.views.RecyclableView
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

class HybridRecyclerListView(
  context: Context = requireNotNull(NitroModules.applicationContext),
) : HybridRecyclerListViewSpec(), RecyclableView {
  override val view = RecyclerListContainer(context)
  private val recyclerView get() = view.recyclerView
  private val adapter = NativeAdapter()
  private val measuredSizes = HashMap<String, Pair<Int, Int>>()
  private val holders = HashMap<Int, NativeHolder>()
  private val hosts = HashMap<Int, HybridRecyclerCellHostView>()
  private val stickySlots = HashMap<Int, Int>()
  private var activeStickyBindings: List<SlotBinding> = emptyList()
  private var nextSlotId = 1
  private var previousListId = ""
  private var lastVisibleRange = VisibleRange(-1.0, -1.0)
  private var endReachedArmed = true
  private var previousDescriptorVersion = ""
  private var downY = 0f
  private var pullOffset = 0f
  private var draggingRefresh = false

  override var listId: String = ""
  override var descriptors: Array<ItemDescriptor> = emptyArray()
  override var layout: RecyclerLayout = RecyclerLayout.LIST
  override var horizontal: Boolean = false
  override var numColumns: Double = 1.0
  override var overscan: Double = 1.0
  override var refreshing: Boolean = false
  override var refreshEnabled: Boolean = false
  override var refreshThreshold: Double = 80.0
  override var endReachedThreshold: Double = 0.5
  override var endReachedEnabled: Boolean = false
  override var onSlotsChanged: (Array<SlotBinding>) -> Unit = {}
  override var onRefreshRequested: () -> Unit = {}
  override var onRefreshProgress: (NativeRefreshPhase, Double, Double) -> Unit = { _, _, _ -> }
  override var onEndReached: () -> Unit = {}
  override var onVisibleRangeChanged: (VisibleRange) -> Unit = {}

  init {
    recyclerView.adapter = adapter
    recyclerView.itemAnimator = null
    recyclerView.setHasFixedSize(false)
    recyclerView.recycledViewPool.setMaxRecycledViews(0, 32)
    recyclerView.addOnScrollListener(object : RecyclerView.OnScrollListener() {
      override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
        publishVisibleState()
        checkEndReached()
      }
    })
    installRefreshGesture()
  }

  override fun afterUpdate() {
    if (previousListId != listId) {
      if (previousListId.isNotEmpty()) RecyclerListRegistry.unregisterList(previousListId, this)
      previousListId = listId
      RecyclerListRegistry.registerList(listId, this)
    }
    val descriptorVersion = descriptors.joinToString("\u001f") { it.key }
    if (descriptorVersion != previousDescriptorVersion) {
      previousDescriptorVersion = descriptorVersion
      endReachedArmed = true
    }
    configureLayoutManager()
    adapter.notifyDataSetChanged()
    if (refreshing) settleRefresh(refreshThreshold.toFloat()) else if (!draggingRefresh) settleRefresh(0f)
    recyclerView.post {
      publishVisibleState()
      checkEndReached()
    }
  }

  fun attachHost(host: HybridRecyclerCellHostView) {
    hosts[host.slotId.toInt()] = host
    val holder = holders[host.slotId.toInt()]
    if (holder == null) {
      view.addManagedChild(host.view)
      layoutStickyHosts()
    } else {
      attachHostToHolder(host, holder)
    }
  }

  fun detachHost(host: HybridRecyclerCellHostView) {
    hosts.remove(host.slotId.toInt())
    (host.view.parent as? ViewGroup)?.removeView(host.view)
  }

  override fun scrollToOffset(offset: Double, animated: Boolean) {
    val current = currentOffset()
    val delta = offset.toInt() - current
    if (animated) recyclerView.smoothScrollBy(if (horizontal) delta else 0, if (horizontal) 0 else delta)
    else recyclerView.scrollBy(if (horizontal) delta else 0, if (horizontal) 0 else delta)
  }

  override fun scrollToIndex(index: Double, viewPosition: Double, animated: Boolean) {
    val target = index.toInt()
    require(target in descriptors.indices) { "scrollToIndex index out of bounds: $target" }
    if (animated) {
      recyclerView.smoothScrollToPosition(target)
    } else {
      (recyclerView.layoutManager as? LinearLayoutManager)?.scrollToPositionWithOffset(target, 0)
        ?: recyclerView.scrollToPosition(target)
    }
  }

  override fun scrollToEnd(animated: Boolean) {
    if (descriptors.isEmpty()) return
    if (animated) recyclerView.smoothScrollToPosition(descriptors.lastIndex)
    else recyclerView.scrollToPosition(descriptors.lastIndex)
  }

  override fun getVisibleRange(): VisibleRange = visibleRange()

  override fun getState(): RecyclerListState {
    val range = visibleRange()
    return RecyclerListState(
      currentOffset().toDouble(),
      if (horizontal) recyclerView.computeHorizontalScrollRange().toDouble() else recyclerView.computeVerticalScrollRange().toDouble(),
      range.first,
      range.last,
      refreshing,
    )
  }

  override fun retryEndReached() {
    endReachedArmed = true
    checkEndReached()
  }

  override fun updateMeasuredSize(key: String, width: Double, height: Double) {
    val next = width.toInt() to height.toInt()
    if (measuredSizes[key] == next) return
    measuredSizes[key] = next
    val index = descriptors.indexOfFirst { it.key == key }
    if (index >= 0) adapter.notifyItemChanged(index)
  }

  override fun prepareForRecycle() {
    recyclerView.stopScroll()
    recyclerView.scrollToPosition(0)
    holders.clear()
    hosts.clear()
    measuredSizes.clear()
    endReachedArmed = true
    pullOffset = 0f
    draggingRefresh = false
  }

  override fun onDropView() {
    RecyclerListRegistry.unregisterList(listId, this)
    recyclerView.adapter = null
  }

  private fun configureLayoutManager() {
    val columns = max(1, numColumns.toInt())
    val orientation = if (horizontal) RecyclerView.HORIZONTAL else RecyclerView.VERTICAL
    val manager = when (layout) {
      RecyclerLayout.LIST -> LinearLayoutManager(view.context, orientation, false)
      RecyclerLayout.GRID -> GridLayoutManager(view.context, columns, orientation, false).also { grid ->
        grid.spanSizeLookup = object : GridLayoutManager.SpanSizeLookup() {
          override fun getSpanSize(position: Int): Int =
            descriptors.getOrNull(position)?.span?.toInt()?.coerceIn(1, columns) ?: 1
        }
      }
      RecyclerLayout.MASONRY -> StaggeredGridLayoutManager(columns, orientation)
    }
    if (recyclerView.layoutManager?.javaClass != manager.javaClass) {
      recyclerView.layoutManager = manager
    }
  }

  private fun visibleRange(): VisibleRange {
    val manager = recyclerView.layoutManager ?: return VisibleRange(-1.0, -1.0)
    return when (manager) {
      is StaggeredGridLayoutManager -> {
        val first = manager.findFirstVisibleItemPositions(null).minOrNull() ?: -1
        val last = manager.findLastVisibleItemPositions(null).maxOrNull() ?: -1
        VisibleRange(first.toDouble(), last.toDouble())
      }
      is LinearLayoutManager -> VisibleRange(
        manager.findFirstVisibleItemPosition().toDouble(),
        manager.findLastVisibleItemPosition().toDouble(),
      )
      else -> VisibleRange(-1.0, -1.0)
    }
  }

  private fun publishVisibleState() {
    val range = visibleRange()
    if (range != lastVisibleRange) {
      lastVisibleRange = range
      onVisibleRangeChanged(range)
    }
    updateStickyBindings()
    publishBindings()
  }

  private fun publishBindings() {
    val bindings = holders.values
      .filter { it.bindingIndex in descriptors.indices }
      .sortedBy { it.bindingIndex }
      .map { holder ->
        val descriptor = descriptors[holder.bindingIndex]
        SlotBinding(holder.slotId.toDouble(), holder.bindingIndex.toDouble(), descriptor.key, descriptor.type)
      }
      .toMutableList()
    bindings.addAll(activeStickyBindings)
    onSlotsChanged(bindings.distinctBy { it.slotId }.sortedBy { it.index }.toTypedArray())
  }

  private fun updateStickyBindings() {
    val firstVisible = visibleRange().first.toInt()
    if (firstVisible < 0) {
      activeStickyBindings = emptyList()
      return
    }
    val levels = descriptors.map { it.stickyLevel.toInt() }.filter { it >= 0 }.distinct().sorted()
    activeStickyBindings = levels.mapNotNull { level ->
      val index = (0..min(firstVisible, descriptors.lastIndex)).lastOrNull {
        descriptors[it].stickyLevel.toInt() == level
      } ?: return@mapNotNull null
      val descriptor = descriptors[index]
      val slot = stickySlots.getOrPut(level) { nextSlotId++ }
      SlotBinding(slot.toDouble(), index.toDouble(), descriptor.key, descriptor.type)
    }
    layoutStickyHosts()
  }

  private fun layoutStickyHosts() {
    var top = 0f
    activeStickyBindings.sortedBy { descriptors[it.index.toInt()].stickyLevel }.forEach { binding ->
      val index = binding.index.toInt()
      val descriptor = descriptors.getOrNull(index) ?: return@forEach
      val host = hosts[binding.slotId.toInt()] ?: return@forEach
      val hostView = host.view
      (hostView.parent as? ViewGroup)?.removeView(hostView)
      val height = measuredSizes[descriptor.key]?.second ?: descriptor.estimatedSize.toInt()
      var nextIndex = -1
      for (candidate in (index + 1)..descriptors.lastIndex) {
        if (descriptors[candidate].stickyLevel.toInt() == descriptor.stickyLevel.toInt()) {
          nextIndex = candidate
          break
        }
      }
      val nextTop = if (nextIndex >= 0) recyclerView.layoutManager?.findViewByPosition(nextIndex)?.top?.toFloat()
        else null
      val y = if (nextTop == null) top else min(top, nextTop - height)
      view.addView(
        hostView,
        FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, max(1, height)),
      )
      hostView.visibility = View.VISIBLE
      hostView.translationY = y
      hostView.elevation = 20f + descriptor.stickyLevel.toFloat()
      top += height
    }
  }

  private fun checkEndReached() {
    if (!endReachedEnabled || !endReachedArmed || descriptors.isEmpty()) return
    val range = visibleRange()
    val viewportItems = max(1.0, range.last - range.first + 1.0)
    val remaining = descriptors.lastIndex - range.last
    if (remaining <= viewportItems * max(0.0, endReachedThreshold)) {
      endReachedArmed = false
      onEndReached()
    }
  }

  private fun currentOffset(): Int =
    if (horizontal) recyclerView.computeHorizontalScrollOffset() else recyclerView.computeVerticalScrollOffset()

  private fun attachHostToHolder(host: HybridRecyclerCellHostView, holder: NativeHolder) {
    val hostView = host.view
    (hostView.parent as? ViewGroup)?.removeView(hostView)
    holder.container.removeAllViews()
    holder.container.addView(
      hostView,
      FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT),
    )
    hostView.visibility = View.VISIBLE
    hostView.addOnLayoutChangeListener { _, _, _, right, bottom, _, _, oldRight, oldBottom ->
      if (right != oldRight || bottom != oldBottom) {
        updateMeasuredSize(host.itemKey, right.toDouble(), bottom.toDouble())
      }
    }
  }

  private fun installRefreshGesture() {
    recyclerView.setOnTouchListener { _, event ->
      if (!refreshEnabled || horizontal) return@setOnTouchListener false
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          downY = event.y
          draggingRefresh = false
        }
        MotionEvent.ACTION_MOVE -> {
          val distance = event.y - downY
          if (distance > 0 && !recyclerView.canScrollVertically(-1)) {
            draggingRefresh = true
            setPullOffset(min(refreshThreshold.toFloat() * 1.5f, distance * 0.5f))
          }
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          if (draggingRefresh) {
            val shouldRefresh = pullOffset >= refreshThreshold.toFloat()
            draggingRefresh = false
            if (shouldRefresh) {
              setPullOffset(refreshThreshold.toFloat())
              onRefreshRequested()
            } else {
              settleRefresh(0f)
            }
          }
        }
      }
      false
    }
  }

  private fun setPullOffset(value: Float) {
    pullOffset = value
    recyclerView.translationY = value
    val threshold = max(1f, refreshThreshold.toFloat())
    val phase = if (refreshing) NativeRefreshPhase.REFRESHING
      else if (value >= threshold) NativeRefreshPhase.READY
      else if (value > 0) NativeRefreshPhase.PULLING
      else NativeRefreshPhase.IDLE
    onRefreshProgress(phase, value.toDouble(), min(1f, value / threshold).toDouble())
  }

  private fun settleRefresh(target: Float) {
    if (abs(recyclerView.translationY - target) < 0.5f) return
    recyclerView.animate().translationY(target).setDuration(180).withEndAction {
      setPullOffset(target)
      if (target == 0f) onRefreshProgress(NativeRefreshPhase.IDLE, 0.0, 0.0)
    }.start()
  }

  private inner class NativeAdapter : RecyclerView.Adapter<NativeHolder>() {
    private val viewTypes = HashMap<String, Int>()

    override fun getItemCount(): Int = descriptors.size

    override fun getItemViewType(position: Int): Int =
      viewTypes.getOrPut(descriptors[position].type) { viewTypes.size + 1 }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): NativeHolder {
      val holder = NativeHolder(RecyclerCellContainer(parent.context), nextSlotId++)
      holders[holder.slotId] = holder
      return holder
    }

    override fun onBindViewHolder(holder: NativeHolder, position: Int) {
      holder.bindingIndex = position
      val descriptor = descriptors[position]
      val measured = measuredSizes[descriptor.key]
      val size = measured?.second ?: descriptor.estimatedSize.toInt()
      holder.container.layoutParams = RecyclerView.LayoutParams(
        if (horizontal) size else ViewGroup.LayoutParams.MATCH_PARENT,
        if (horizontal) ViewGroup.LayoutParams.MATCH_PARENT else max(1, size),
      )
      if (layout == RecyclerLayout.MASONRY) {
        (holder.container.layoutParams as? StaggeredGridLayoutManager.LayoutParams)?.isFullSpan =
          descriptor.span.toInt() >= max(1, numColumns.toInt())
      }
      hosts[holder.slotId]?.let { attachHostToHolder(it, holder) }
      recyclerView.post { publishBindings() }
    }

    override fun onViewRecycled(holder: NativeHolder) {
      holder.container.removeAllViews()
      holder.bindingIndex = -1
      super.onViewRecycled(holder)
      recyclerView.post { publishBindings() }
    }
  }

  private class NativeHolder(
    val container: RecyclerCellContainer,
    val slotId: Int,
  ) : RecyclerView.ViewHolder(container) {
    var bindingIndex: Int = -1
  }
}
