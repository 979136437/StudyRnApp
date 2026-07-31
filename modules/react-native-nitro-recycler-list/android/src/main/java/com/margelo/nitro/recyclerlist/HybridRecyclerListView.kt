package com.margelo.nitro.recyclerlist

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.recyclerview.widget.StaggeredGridLayoutManager
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.uimanager.PixelUtil
import com.margelo.nitro.NitroModules
import com.margelo.nitro.views.RecyclableView
import kotlin.math.abs
import kotlin.math.ceil
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
  private var previousLayoutVersion = ""
  private var previousTabCoordinatorId = ""
  private var previousTabKey = ""
  private var previousTabActive = false
  private var downX = 0f
  private var downY = 0f
  private var pullGestureEligible = false
  private var pullStartY: Float? = null
  private var pullOffset = 0f
  private var draggingRefresh = false
  private var settlingRefresh = false
  private var openingSecondLevel = false
  private var closingSecondLevel = false
  private var dropped = false
  private var recycling = false
  private var lifecycleGeneration = 0
  private var bindingPublishPending = false
  private val sizeChangedPayload = Any()
  private var refreshAnimationTarget: Float? = null
  private var refreshAnimator: ValueAnimator? = null
  private val refreshEvents = RecyclerListRefreshEventState()
  private val touchSlop = ViewConfiguration.get(view.context).scaledTouchSlop.toFloat()

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
    view.onManagedChildAdded = { child ->
      if (!dropped && !recycling) {
        hosts.values.firstOrNull { it.view === child }?.let(::attachHostIfMounted)
      }
    }
    recyclerView.adapter = adapter
    recyclerView.itemAnimator = null
    recyclerView.setHasFixedSize(false)
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
    recycling = false
    if (recyclerView.adapter !== adapter) {
      recyclerView.swapAdapter(adapter, false)
    }
    if (previousListId != listId) {
      if (previousListId.isNotEmpty()) {
        publishRefresh(
          NativeRefreshPhase.IDLE,
          0.0,
          0.0,
          targetListId = previousListId,
        )
        RecyclerListRegistry.unregisterList(previousListId, this)
      }
      previousListId = listId
      RecyclerListRegistry.registerList(listId, this)
    }
    val descriptorVersion = descriptors.joinToString("\u001f") {
      "${it.key}:${it.type}:${it.span}:${it.stickyGroup}:${it.stickyLevel}:${it.estimatedSize}"
    }
    val layoutVersion = "$layout:$horizontal:${max(1, numColumns.toInt())}:${max(0.0, overscan)}"
    if (layoutVersion != previousLayoutVersion) {
      previousLayoutVersion = layoutVersion
      configureLayoutManager()
    }
    if (descriptorVersion != previousDescriptorVersion) {
      previousDescriptorVersion = descriptorVersion
      endReachedArmed = true
      adapter.notifyDataSetChanged()
    }
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
    val generation = lifecycleGeneration
    recyclerView.post {
      if (recycling || generation != lifecycleGeneration) return@post
      publishVisibleState()
      checkEndReached()
      if (secondLevelEnabled && secondLevelOpen && pullOffset < view.height) {
        settleSecondLevel(max(1, view.height).toFloat(), true)
      }
    }
  }

  fun attachHost(host: HybridRecyclerCellHostView) {
    val slot = host.slotId.toInt()
    hosts[slot] = host
    // `afterUpdate()` runs before Fabric's addViewAt instruction in the same mount batch.
    // Reparenting here would give the host a native parent before Fabric inserts it.
    val generation = lifecycleGeneration
    view.post {
      if (dropped || recycling || generation != lifecycleGeneration || hosts[slot] !== host) return@post
      attachHostIfMounted(host)
    }
  }

  private fun attachHostIfMounted(host: HybridRecyclerCellHostView) {
    if (!view.isManagedChild(host.view)) return
    holders[host.slotId.toInt()]?.let { attachHostToHolder(host, it) } ?: layoutStickyHosts()
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
    if (!width.isFinite() || !height.isFinite() || width <= 0.0 || height <= 0.0) return
    val next = PixelUtil.toPixelFromDIP(width).toInt() to PixelUtil.toPixelFromDIP(height).toInt()
    val generation = lifecycleGeneration
    UiThreadUtil.runOnUiThread {
      if (!recycling && generation == lifecycleGeneration) applyMeasuredSize(key, next)
    }
  }

  private fun applyMeasuredSize(key: String, next: Pair<Int, Int>) {
    if (dropped) return
    if (measuredSizes[key] == next) return
    measuredSizes[key] = next
    applyMeasuredItemLayout(key)
  }

  private fun applyMeasuredItemLayout(key: String) {
    if (dropped) return
    if (recyclerView.isComputingLayout) {
      val generation = lifecycleGeneration
      recyclerView.post {
        if (!recycling && generation == lifecycleGeneration) applyMeasuredItemLayout(key)
      }
      return
    }
    val index = descriptors.indexOfFirst { it.key == key }
    if (index < 0) return
    adapter.notifyItemChanged(index, sizeChangedPayload)
  }

  override fun prepareForRecycle() {
    lifecycleGeneration += 1
    recycling = true
    bindingPublishPending = false
    RecyclerListRegistry.unregisterList(previousListId.ifEmpty { listId }, this)
    RecyclerTabCoordinatorRegistry.unregister(this)
    recyclerView.stopScroll()
    recyclerView.swapAdapter(null, true)
    recyclerView.scrollToPosition(0)
    hosts.clear()
    holders.values.forEach { holder -> holder.bindingIndex = -1 }
    measuredSizes.clear()
    stickySlots.clear()
    activeStickyBindings = emptyList()
    lastVisibleRange = VisibleRange(-1.0, -1.0)
    endReachedArmed = true
    previousListId = ""
    previousDescriptorVersion = ""
    previousLayoutVersion = ""
    previousTabCoordinatorId = ""
    previousTabKey = ""
    previousTabActive = false
    resetRefresh()
  }

  override fun onDropView() {
    if (dropped) return
    dropped = true
    resetRefresh()
    RecyclerListRegistry.unregisterList(listId, this)
    RecyclerTabCoordinatorRegistry.unregister(this)
    view.onManagedChildAdded = null
    hosts.clear()
    holders.clear()
    recyclerView.stopScroll()
    recyclerView.swapAdapter(null, false)
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
      RecyclerLayout.MASONRY -> OverscanStaggeredGridLayoutManager(columns, orientation).also { masonry ->
        masonry.gapStrategy = StaggeredGridLayoutManager.GAP_HANDLING_NONE
      }
    }
    recyclerView.layoutManager = manager
    manager.isItemPrefetchEnabled = overscan > 0
    val cachedItems = ceil(max(0.0, overscan) * 12.0 * columns).toInt()
    recyclerView.setItemViewCacheSize(max(2, cachedItems))
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
    scheduleBindingsPublish()
  }

  private fun scheduleBindingsPublish() {
    if (dropped || recycling || bindingPublishPending) return
    bindingPublishPending = true
    val generation = lifecycleGeneration
    recyclerView.post {
      if (recycling || generation != lifecycleGeneration) return@post
      bindingPublishPending = false
      if (!dropped) publishBindings()
    }
  }

  private fun publishBindings() {
    val bindings = holders.values
      .filter { it.bindingIndex in descriptors.indices }
      .map { holder ->
        val descriptor = descriptors[holder.bindingIndex]
        SlotBinding(holder.slotId.toDouble(), holder.bindingIndex.toDouble(), descriptor.key, descriptor.type)
      }
      .toMutableList()
    bindings.addAll(activeStickyBindings)
    onSlotsChanged(bindings.distinctBy { it.slotId }.sortedBy { it.slotId }.toTypedArray())
  }

  private fun updateStickyBindings() {
    val firstVisible = visibleRange().first.toInt()
    if (firstVisible < 0) {
      replaceActiveStickyBindings(emptyList())
      return
    }
    val layoutManager = recyclerView.layoutManager ?: return
    fun hasCrossedTop(index: Int, stackOffset: Int = 0): Boolean {
      if (index < firstVisible) return true
      val itemView = layoutManager.findViewByPosition(index) ?: return false
      val itemStart = if (horizontal) itemView.left else itemView.top
      return itemStart < stackOffset
    }

    val activeMarker = (0..min(firstVisible, descriptors.lastIndex)).lastOrNull {
      descriptors[it].stickyLevel >= 0 && hasCrossedTop(it)
    }
    val activeGroup = activeMarker?.let { descriptors[it].stickyGroup } ?: run {
      replaceActiveStickyBindings(emptyList())
      return
    }
    val levels = descriptors.indices.filter {
      descriptors[it].stickyGroup == activeGroup && descriptors[it].stickyLevel >= 0
    }.map { descriptors[it].stickyLevel.toInt() }.distinct().sorted()
    var stackOffset = 0
    val nextBindings = levels.mapNotNull { level ->
      val index = (0..min(firstVisible, descriptors.lastIndex)).lastOrNull {
        descriptors[it].stickyGroup == activeGroup &&
          descriptors[it].stickyLevel.toInt() == level &&
          hasCrossedTop(it, stackOffset)
      } ?: return@mapNotNull null
      val descriptor = descriptors[index]
      stackOffset += measuredSizes[descriptor.key]?.second ?: estimatedSizePx(descriptor)
      val slot = stickySlots.getOrPut("$activeGroup:$level") { nextSlotId++ }
      SlotBinding(slot.toDouble(), index.toDouble(), descriptor.key, descriptor.type)
    }
    replaceActiveStickyBindings(nextBindings)
    layoutStickyHosts()
  }

  private fun replaceActiveStickyBindings(next: List<SlotBinding>) {
    val nextSlots = next.mapTo(HashSet()) { it.slotId.toInt() }
    activeStickyBindings.forEach { binding ->
      if (binding.slotId.toInt() !in nextSlots) {
        hosts[binding.slotId.toInt()]?.view?.visibility = View.INVISIBLE
      }
    }
    activeStickyBindings = next
  }

  private fun layoutStickyHosts() {
    val activeGroup = activeStickyBindings.firstOrNull()?.let {
      descriptors.getOrNull(it.index.toInt())?.stickyGroup
    } ?: return
    val totalHeight = activeStickyBindings.sumOf { binding ->
      val descriptor = descriptors[binding.index.toInt()]
      measuredSizes[descriptor.key]?.second ?: estimatedSizePx(descriptor)
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
      if (!view.isManagedChild(hostView)) return@forEach
      (hostView.parent as? ViewGroup)?.removeView(hostView)
      val height = measuredSizes[descriptor.key]?.second ?: estimatedSizePx(descriptor)
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

  private fun estimatedSizePx(descriptor: ItemDescriptor): Int =
    max(1, PixelUtil.toPixelFromDIP(max(1.0, descriptor.estimatedSize)).toInt())

  private fun attachHostToHolder(host: HybridRecyclerCellHostView, holder: NativeHolder) {
    val hostView = host.view
    if (dropped || !view.isManagedChild(hostView)) return
    if (hostView.parent === holder.container) {
      hostView.visibility = View.VISIBLE
      return
    }
    (hostView.parent as? ViewGroup)?.removeView(hostView)
    holder.container.removeAllViews()
    holder.container.addView(
      hostView,
      FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT),
    )
    hostView.visibility = View.VISIBLE
  }

  private fun installRefreshGesture() {
    recyclerView.setOnTouchListener { _, event ->
      if (!refreshEnabled || horizontal || !tabActive || refreshing || secondLevelOpen) return@setOnTouchListener false
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          refreshAnimator?.cancel()
          refreshAnimator = null
          settlingRefresh = false
          openingSecondLevel = false
          closingSecondLevel = false
          downX = event.rawX
          downY = event.rawY
          pullGestureEligible = !recyclerView.canScrollVertically(-1)
          pullStartY = if (pullGestureEligible) event.rawY else null
          draggingRefresh = false
        }
        MotionEvent.ACTION_MOVE -> {
          if (!pullGestureEligible) return@setOnTouchListener false
          if (!draggingRefresh && recyclerView.canScrollVertically(-1)) {
            pullGestureEligible = false
            pullStartY = null
            return@setOnTouchListener false
          }
          val distance = event.rawY - (pullStartY ?: return@setOnTouchListener false)
          val verticalDistance = event.rawY - downY
          val horizontalDistance = abs(event.rawX - downX)
          if (!draggingRefresh &&
            (distance <= touchSlop || verticalDistance <= 0 || abs(verticalDistance) <= horizontalDistance)
          ) return@setOnTouchListener false

          draggingRefresh = true
          val limit = if (secondLevelEnabled) secondLevelThresholdPx() * 1.15f else refreshThresholdPx()
          setPullOffset(min(limit, max(0f, distance - touchSlop) * 0.5f))
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          if (draggingRefresh) {
            draggingRefresh = false
            if (event.actionMasked == MotionEvent.ACTION_CANCEL) {
              settleRefresh(0f)
            } else if (secondLevelEnabled && pullOffset >= secondLevelThresholdPx()) {
              setPullOffset(secondLevelThresholdPx())
              onSecondLevelRequested()
            } else if (pullOffset >= refreshThresholdPx()) {
              setPullOffset(refreshThresholdPx())
              onRefreshRequested()
            } else {
              settleRefresh(0f)
            }
          }
          pullGestureEligible = false
          pullStartY = null
        }
      }
      false
    }
  }

  private fun setPullOffset(value: Float) {
    pullOffset = value
    view.translationY = value
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
    if (refreshAnimator?.isRunning == true &&
      refreshAnimationTarget?.let { abs(it - target) < 0.5f } == true
    ) return
    refreshAnimator?.cancel()
    refreshAnimator = null
    refreshAnimationTarget = target
    if (abs(pullOffset - target) < 0.5f) {
      settlingRefresh = false
      refreshAnimationTarget = null
      setPullOffset(target)
      return
    }
    settlingRefresh = target == 0f
    refreshAnimator = ValueAnimator.ofFloat(pullOffset, target).apply {
      duration = 140
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
          if (refreshAnimator === animation) {
            refreshAnimator = null
            refreshAnimationTarget = null
          }
        }
      })
      start()
    }
  }

  private fun settleSecondLevel(target: Float, opening: Boolean) {
    refreshAnimator?.cancel()
    refreshAnimator = null
    refreshAnimationTarget = null
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
    refreshAnimationTarget = null
    draggingRefresh = false
    settlingRefresh = false
    openingSecondLevel = false
    closingSecondLevel = false
    pullGestureEligible = false
    pullStartY = null
    pullOffset = 0f
    view.translationY = 0f
    publishRefresh(NativeRefreshPhase.IDLE, 0.0, 0.0)
  }

  private fun updateHolderLayout(holder: NativeHolder, descriptor: ItemDescriptor, size: Int) {
    val baseParams = holder.container.layoutParams ?: RecyclerView.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.WRAP_CONTENT,
    )
    val params = if (layout == RecyclerLayout.MASONRY &&
      baseParams !is StaggeredGridLayoutManager.LayoutParams
    ) StaggeredGridLayoutManager.LayoutParams(baseParams) else baseParams
    params.width = if (horizontal) size else ViewGroup.LayoutParams.MATCH_PARENT
    params.height = if (horizontal) ViewGroup.LayoutParams.MATCH_PARENT else max(1, size)
    if (params is StaggeredGridLayoutManager.LayoutParams) {
      params.isFullSpan = descriptor.span.toInt() >= max(1, numColumns.toInt())
    }
    holder.container.layoutParams = params
  }

  private fun averageEstimatedSizePx(): Int {
    if (descriptors.isEmpty()) return 1
    val average = descriptors.sumOf { max(1.0, it.estimatedSize) } / descriptors.size
    return max(1, PixelUtil.toPixelFromDIP(average).toInt())
  }

  private fun overscanPrefetchItemCount(spanCount: Int): Int {
    if (overscan <= 0) return spanCount
    val viewportSize = if (horizontal) recyclerView.width else recyclerView.height
    val visibleRows = ceil(max(1, viewportSize).toDouble() / averageEstimatedSizePx()).toInt()
    return max(spanCount, ceil(overscan * visibleRows * spanCount).toInt())
  }

  private inner class OverscanStaggeredGridLayoutManager(
    private val configuredSpanCount: Int,
    private val scrollOrientation: Int,
  ) : StaggeredGridLayoutManager(configuredSpanCount, scrollOrientation) {
    override fun collectAdjacentPrefetchPositions(
      dx: Int,
      dy: Int,
      state: RecyclerView.State,
      layoutPrefetchRegistry: RecyclerView.LayoutManager.LayoutPrefetchRegistry,
    ) {
      val delta = if (scrollOrientation == RecyclerView.HORIZONTAL) dx else dy
      if (delta == 0 || state.itemCount == 0) return
      val anchor = if (delta > 0) {
        findLastVisibleItemPositions(null).maxOrNull() ?: RecyclerView.NO_POSITION
      } else {
        findFirstVisibleItemPositions(null).minOrNull() ?: RecyclerView.NO_POSITION
      }
      if (anchor == RecyclerView.NO_POSITION) return

      val direction = if (delta > 0) 1 else -1
      val distancePerRow = averageEstimatedSizePx()
      val prefetchCount = overscanPrefetchItemCount(configuredSpanCount)
      for (step in 1..prefetchCount) {
        val position = anchor + direction * step
        if (position !in 0 until state.itemCount) break
        val rowDistance = ((step - 1) / configuredSpanCount) * distancePerRow
        layoutPrefetchRegistry.addPosition(position, rowDistance)
      }
    }
  }

  private inner class NativeAdapter : RecyclerView.Adapter<NativeHolder>() {
    private val viewTypes = HashMap<String, Int>()

    override fun getItemCount(): Int = if (recycling) 0 else descriptors.size

    override fun getItemViewType(position: Int): Int =
      viewTypes.getOrPut(descriptors[position].type) {
        val viewType = viewTypes.size + 1
        recyclerView.recycledViewPool.setMaxRecycledViews(viewType, 32)
        viewType
      }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): NativeHolder {
      val holder = NativeHolder(RecyclerCellContainer(parent.context), nextSlotId++)
      holders[holder.slotId] = holder
      return holder
    }

    override fun onBindViewHolder(holder: NativeHolder, position: Int) {
      holders[holder.slotId] = holder
      holder.bindingIndex = position
      val descriptor = descriptors[position]
      val measured = measuredSizes[descriptor.key]
      val size = measured?.let { if (horizontal) it.first else it.second } ?: estimatedSizePx(descriptor)
      updateHolderLayout(holder, descriptor, size)
      hosts[holder.slotId]?.let { attachHostToHolder(it, holder) }
      scheduleBindingsPublish()
    }

    override fun onBindViewHolder(holder: NativeHolder, position: Int, payloads: MutableList<Any>) {
      if (payloads.any { it === sizeChangedPayload }) {
        holders[holder.slotId] = holder
        holder.bindingIndex = position
        val descriptor = descriptors[position]
        val measured = measuredSizes[descriptor.key]
        val size = measured?.let { if (horizontal) it.first else it.second } ?: estimatedSizePx(descriptor)
        updateHolderLayout(holder, descriptor, size)
        return
      }
      super.onBindViewHolder(holder, position, payloads)
    }

    override fun onViewRecycled(holder: NativeHolder) {
      // Keep the stable slot and its React host parked in the recycled holder. The next bind
      // replaces only the item subtree, avoiding an empty frame while JavaScript recreates it.
      holder.container.clearFocus()
      super.onViewRecycled(holder)
    }
  }

  private class NativeHolder(
    val container: RecyclerCellContainer,
    val slotId: Int,
  ) : RecyclerView.ViewHolder(container) {
    var bindingIndex: Int = -1
  }
}
