package com.margelo.nitro.recyclerlist

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.recyclerview.widget.StaggeredGridLayoutManager
import com.facebook.react.uimanager.PixelUtil
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
  private val stickySlots = HashMap<String, Int>()
  private var activeStickyBindings: List<SlotBinding> = emptyList()
  private var nextSlotId = 1
  private var previousListId = ""
  private var lastVisibleRange = VisibleRange(-1.0, -1.0)
  private var endReachedArmed = true
  private var previousDescriptorVersion = ""
  private var previousTabCoordinatorId = ""
  private var previousTabKey = ""
  private var previousTabActive = false
  private var downY = 0f
  private var pullOffset = 0f
  private var draggingRefresh = false
  private var settlingRefresh = false
  private var openingSecondLevel = false
  private var closingSecondLevel = false
  private var refreshAnimator: ValueAnimator? = null
  private val refreshEvents = RecyclerListRefreshEventState()

  override var listId: String = ""
  override var descriptors: Array<ItemDescriptor> = emptyArray()
  override var layout: RecyclerLayout = RecyclerLayout.LIST
  override var horizontal: Boolean = false
  override var numColumns: Double = 1.0
  override var overscan: Double = 1.0
  override var refreshing: Boolean = false
  override var refreshEnabled: Boolean = false
  override var refreshThreshold: Double = 80.0
  override var secondLevelEnabled: Boolean = false
  override var secondLevelOpen: Boolean = false
  override var secondLevelThreshold: Double = 160.0
  override var tabCoordinatorId: String = ""
  override var tabKey: String = ""
  override var tabActive: Boolean = true
  override var tabCollapseRange: Double = 0.0
  override var endReachedThreshold: Double = 0.5
  override var endReachedEnabled: Boolean = false
  override var onSlotsChanged: (Array<SlotBinding>) -> Unit = {}
  override var onRefreshRequested: () -> Unit = {}
  override var onRefreshPhaseChanged: (NativeRefreshPhase) -> Unit = {}
  override var onSecondLevelRequested: () -> Unit = {}
  override var onSecondLevelPhaseChanged: (NativeSecondLevelPhase) -> Unit = {}
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
        publishTabScroll()
      }
    })
    installRefreshGesture()
  }

  override fun afterUpdate() {
    if (previousListId != listId) {
      if (previousListId.isNotEmpty()) {
        publishRefresh(NativeRefreshPhase.IDLE, 0.0, 0.0, previousListId)
        RecyclerListRegistry.unregisterList(previousListId, this)
      }
      previousListId = listId
      RecyclerListRegistry.registerList(listId, this)
    }
    val descriptorVersion = descriptors.joinToString("\u001f") {
      "${it.key}:${it.stickyGroup}:${it.stickyLevel}"
    }
    if (descriptorVersion != previousDescriptorVersion) {
      previousDescriptorVersion = descriptorVersion
      endReachedArmed = true
    }
    configureLayoutManager()
    adapter.notifyDataSetChanged()
    if (tabCoordinatorId != previousTabCoordinatorId || tabKey != previousTabKey) {
      if (previousTabCoordinatorId.isNotEmpty()) {
        RecyclerTabCoordinatorRegistry.unregister(previousTabCoordinatorId, previousTabKey, this)
      }
      previousTabCoordinatorId = tabCoordinatorId
      previousTabKey = tabKey
      RecyclerTabCoordinatorRegistry.register(this)
    }
    if (tabActive && !previousTabActive && tabCoordinatorId.isNotEmpty()) {
      scrollToOffset(RecyclerTabCoordinatorRegistry.targetOffset(this), false)
    }
    previousTabActive = tabActive
    if (!refreshEnabled || horizontal || !tabActive) {
      resetRefresh()
    } else if (secondLevelEnabled && secondLevelOpen) {
      settleSecondLevel(max(1, view.height).toFloat(), true)
    } else if (refreshEvents.secondLevelPhase == NativeSecondLevelPhase.OPEN ||
      refreshEvents.secondLevelPhase == NativeSecondLevelPhase.OPENING
    ) {
      settleSecondLevel(0f, false)
    } else if (refreshing) {
      settleRefresh(refreshThresholdPx())
    } else if (!draggingRefresh) {
      settleRefresh(0f)
    }
    recyclerView.post {
      publishVisibleState()
      checkEndReached()
      if (secondLevelEnabled && secondLevelOpen && pullOffset < view.height) {
        settleSecondLevel(max(1, view.height).toFloat(), true)
      }
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
    val target = PixelUtil.toPixelFromDIP(offset).toInt()
    val delta = target - current
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
      offset = PixelUtil.toDIPFromPixel(currentOffset().toFloat()).toDouble(),
      contentSize = PixelUtil.toDIPFromPixel(
        if (horizontal) recyclerView.computeHorizontalScrollRange().toFloat() else recyclerView.computeVerticalScrollRange().toFloat(),
      ).toDouble(),
      firstVisibleIndex = range.first,
      lastVisibleIndex = range.last,
      refreshing = refreshing,
      secondLevelOpen = refreshEvents.secondLevelPhase == NativeSecondLevelPhase.OPEN,
      secondLevelPhase = refreshEvents.secondLevelPhase,
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
    resetRefresh()
    RecyclerTabCoordinatorRegistry.unregister(this)
  }

  override fun onDropView() {
    resetRefresh()
    RecyclerListRegistry.unregisterList(listId, this)
    RecyclerTabCoordinatorRegistry.unregister(this)
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
    val activeGroup = (0..min(firstVisible, descriptors.lastIndex)).lastOrNull {
      descriptors[it].stickyLevel >= 0
    }?.let { descriptors[it].stickyGroup } ?: run {
      activeStickyBindings = emptyList()
      return
    }
    val levels = descriptors.filter { it.stickyGroup == activeGroup }
      .map { it.stickyLevel.toInt() }.filter { it >= 0 }.distinct().sorted()
    activeStickyBindings = levels.mapNotNull { level ->
      val index = (0..min(firstVisible, descriptors.lastIndex)).lastOrNull {
        descriptors[it].stickyGroup == activeGroup && descriptors[it].stickyLevel.toInt() == level
      } ?: return@mapNotNull null
      val descriptor = descriptors[index]
      val slot = stickySlots.getOrPut("$activeGroup:$level") { nextSlotId++ }
      SlotBinding(slot.toDouble(), index.toDouble(), descriptor.key, descriptor.type)
    }
    layoutStickyHosts()
  }

  private fun layoutStickyHosts() {
    val activeGroup = activeStickyBindings.firstOrNull()?.let {
      descriptors.getOrNull(it.index.toInt())?.stickyGroup
    } ?: return
    val totalHeight = activeStickyBindings.sumOf { binding ->
      val descriptor = descriptors[binding.index.toInt()]
      measuredSizes[descriptor.key]?.second ?: descriptor.estimatedSize.toInt()
    }
    val nextGroupIndex = descriptors.indices.firstOrNull { index ->
      index > activeStickyBindings.maxOf { it.index.toInt() } &&
        descriptors[index].stickyLevel >= 0 && descriptors[index].stickyGroup != activeGroup
    }
    val nextGroupTop = nextGroupIndex?.let {
      recyclerView.layoutManager?.findViewByPosition(it)?.top?.toFloat()
    }
    val groupShift = if (nextGroupTop == null) 0f else min(0f, nextGroupTop - totalHeight)
    var top = 0f
    activeStickyBindings.sortedBy { descriptors[it.index.toInt()].stickyLevel }.forEach { binding ->
      val index = binding.index.toInt()
      val descriptor = descriptors.getOrNull(index) ?: return@forEach
      val host = hosts[binding.slotId.toInt()] ?: return@forEach
      val hostView = host.view
      (hostView.parent as? ViewGroup)?.removeView(hostView)
      val height = measuredSizes[descriptor.key]?.second ?: descriptor.estimatedSize.toInt()
      var nextIndex = -1
      for (candidate in (index + 1) until descriptors.size) {
        if (descriptors[candidate].stickyGroup == activeGroup &&
          descriptors[candidate].stickyLevel.toInt() == descriptor.stickyLevel.toInt()
        ) {
          nextIndex = candidate
          break
        }
      }
      val nextTop = if (nextIndex >= 0) recyclerView.layoutManager?.findViewByPosition(nextIndex)?.top?.toFloat()
        else null
      val y = (if (nextTop == null) top else min(top, nextTop - height)) + groupShift
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
      if (!refreshEnabled || horizontal || !tabActive || secondLevelOpen) return@setOnTouchListener false
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          refreshAnimator?.cancel()
          refreshAnimator = null
          settlingRefresh = false
          openingSecondLevel = false
          closingSecondLevel = false
          downY = event.y
          draggingRefresh = false
        }
        MotionEvent.ACTION_MOVE -> {
          val distance = event.y - downY
          if (distance > 0 && !recyclerView.canScrollVertically(-1)) {
            draggingRefresh = true
            val limit = if (secondLevelEnabled) secondLevelThresholdPx() * 1.15f else refreshThresholdPx() * 1.5f
            setPullOffset(min(limit, distance * 0.5f))
          }
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          if (draggingRefresh) {
            draggingRefresh = false
            if (secondLevelEnabled && pullOffset >= secondLevelThresholdPx()) {
              setPullOffset(secondLevelThresholdPx())
              onSecondLevelRequested()
            } else if (pullOffset >= refreshThresholdPx()) {
              setPullOffset(refreshThresholdPx())
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
    val threshold = refreshThresholdPx()
    val phase = if (refreshing) NativeRefreshPhase.REFRESHING
      else if (settlingRefresh) NativeRefreshPhase.SETTLING
      else if (value >= threshold) NativeRefreshPhase.READY
      else if (value > 0) NativeRefreshPhase.PULLING
      else NativeRefreshPhase.IDLE
    val secondThreshold = secondLevelThresholdPx()
    val secondPhase = when {
      openingSecondLevel -> NativeSecondLevelPhase.OPENING
      closingSecondLevel -> NativeSecondLevelPhase.CLOSING
      secondLevelOpen -> NativeSecondLevelPhase.OPEN
      secondLevelEnabled && value >= secondThreshold -> NativeSecondLevelPhase.READY
      secondLevelEnabled && value > threshold -> NativeSecondLevelPhase.PULLING
      else -> NativeSecondLevelPhase.IDLE
    }
    publishRefresh(
      phase,
      PixelUtil.toDIPFromPixel(value).toDouble(),
      min(1f, value / threshold).toDouble(),
      secondPhase,
      if (!secondLevelEnabled) 0.0 else ((value - threshold) / max(1f, secondThreshold - threshold)).coerceIn(0f, 1f).toDouble(),
    )
  }

  private fun settleRefresh(target: Float) {
    refreshAnimator?.cancel()
    refreshAnimator = null
    if (abs(pullOffset - target) < 0.5f) {
      settlingRefresh = false
      setPullOffset(target)
      return
    }
    settlingRefresh = target == 0f
    refreshAnimator = ValueAnimator.ofFloat(pullOffset, target).apply {
      duration = 180
      addUpdateListener { animator -> setPullOffset(animator.animatedValue as Float) }
      addListener(object : AnimatorListenerAdapter() {
        private var cancelled = false

        override fun onAnimationCancel(animation: Animator) {
          cancelled = true
        }

        override fun onAnimationEnd(animation: Animator) {
          if (!cancelled) {
            settlingRefresh = false
            setPullOffset(target)
          }
          if (refreshAnimator === animation) refreshAnimator = null
        }
      })
      start()
    }
  }

  private fun settleSecondLevel(target: Float, opening: Boolean) {
    refreshAnimator?.cancel()
    refreshAnimator = null
    settlingRefresh = false
    openingSecondLevel = opening
    closingSecondLevel = !opening
    if (abs(pullOffset - target) < 0.5f) {
      openingSecondLevel = false
      closingSecondLevel = false
      setPullOffset(target)
      return
    }
    refreshAnimator = ValueAnimator.ofFloat(pullOffset, target).apply {
      duration = 260
      addUpdateListener { animator -> setPullOffset(animator.animatedValue as Float) }
      addListener(object : AnimatorListenerAdapter() {
        private var cancelled = false

        override fun onAnimationCancel(animation: Animator) {
          cancelled = true
        }

        override fun onAnimationEnd(animation: Animator) {
          if (!cancelled) {
            openingSecondLevel = false
            closingSecondLevel = false
            setPullOffset(target)
          }
          if (refreshAnimator === animation) refreshAnimator = null
        }
      })
      start()
    }
  }

  private fun publishTabScroll() {
    if (!tabActive || tabCoordinatorId.isEmpty() || horizontal) return
    val offsetDp = PixelUtil.toDIPFromPixel(currentOffset().toFloat()).toDouble()
    RecyclerTabCoordinatorRegistry.update(this, offsetDp)
    RecyclerListRegistry.emitTabScroll(listId, min(max(0.0, tabCollapseRange), max(0.0, offsetDp)))
  }

  private fun refreshThresholdPx(): Float =
    PixelUtil.toPixelFromDIP(max(1.0, refreshThreshold)).toFloat()

  private fun secondLevelThresholdPx(): Float =
    PixelUtil.toPixelFromDIP(max(refreshThreshold + 1.0, secondLevelThreshold)).toFloat()

  private fun publishRefresh(
    phase: NativeRefreshPhase,
    offset: Double,
    progress: Double,
    secondPhase: NativeSecondLevelPhase = NativeSecondLevelPhase.IDLE,
    secondProgress: Double = 0.0,
    targetListId: String = listId,
  ) {
    refreshEvents.publish(
      phase,
      offset,
      progress,
      secondPhase,
      secondProgress,
      { snapshot -> RecyclerListRegistry.emitRefresh(targetListId, snapshot) },
      { nextPhase -> onRefreshPhaseChanged(nextPhase) },
      { nextPhase -> onSecondLevelPhaseChanged(nextPhase) },
    )
  }

  private fun resetRefresh() {
    refreshAnimator?.cancel()
    refreshAnimator = null
    draggingRefresh = false
    settlingRefresh = false
    openingSecondLevel = false
    closingSecondLevel = false
    pullOffset = 0f
    recyclerView.translationY = 0f
    publishRefresh(NativeRefreshPhase.IDLE, 0.0, 0.0)
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
