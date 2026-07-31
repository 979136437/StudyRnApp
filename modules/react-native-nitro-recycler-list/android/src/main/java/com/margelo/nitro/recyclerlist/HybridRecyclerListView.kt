package com.margelo.nitro.recyclerlist

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.os.SystemClock
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
  private val pendingMeasuredSizes = LinkedHashMap<String, Pair<Int, Int>>()
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
  private var previousBindingsSignature: String? = null
  private var nextBindingGeneration = 1L
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
  private var measurementFlushPending = false
  private var measuredLayoutFlushPending = false
  private var stickyLayoutRetryPending = false
  private var awaitingInitialHosts = true
  private val sizeChangedPayload = Any()
  private var scrollTraceAt = 0L
  private var scrollTraceDx = 0
  private var scrollTraceDy = 0
  private var refreshTraceBucket = -1
  private var refreshTracePhase: NativeRefreshPhase? = null
  private var secondLevelTracePhase: NativeSecondLevelPhase? = null
  private var refreshAnimationTarget: Float? = null
  private var refreshAnimator: ValueAnimator? = null
  private var refreshRequestPending = false
  private var refreshRequestGeneration = 0
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
    recyclerView.visibility = View.INVISIBLE
    view.onManagedChildAdded = { child ->
      val host = hosts.values.firstOrNull { it.view === child }
      trace(
        "managed-child-added",
        "child=${RecyclerTrace.objectId(child)} slot=${host?.slotId?.toInt() ?: -1} managed=${view.isManagedChild(child)}",
      )
      if (!dropped && !recycling) {
        host?.let(::attachHostIfMounted)
      }
    }
    recyclerView.adapter = adapter
    recyclerView.itemAnimator = null
    recyclerView.setHasFixedSize(false)
    recyclerView.addOnScrollListener(object : RecyclerView.OnScrollListener() {
      override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
        scrollTraceDx += dx
        scrollTraceDy += dy
        traceScrollSample()
        publishVisibleState()
        checkEndReached()
        publishTabScroll()
      }

      override fun onScrollStateChanged(recyclerView: RecyclerView, newState: Int) {
        traceScrollSample(force = true)
        trace(
          "scroll-state",
          "state=${scrollStateName(newState)} offset=${currentOffset()} range=${visibleRange()} ${stateSnapshot()}",
        )
      }
    })
    recyclerView.addOnChildAttachStateChangeListener(object : RecyclerView.OnChildAttachStateChangeListener {
      override fun onChildViewAttachedToWindow(child: View) {
        traceWindowCell("cell-window-attach", child)
      }

      override fun onChildViewDetachedFromWindow(child: View) {
        traceWindowCell("cell-window-detach", child)
      }
    })
    installRefreshGesture()
  }

  override fun afterUpdate() {
    trace(
      "after-update-start",
      "adapterAttached=${recyclerView.adapter === adapter} descriptors=${descriptors.size} " +
        "refreshEnabled=$refreshEnabled refreshing=$refreshing secondLevelOpen=$secondLevelOpen",
    )
    recycling = false
    if (recyclerView.adapter !== adapter) {
      recyclerView.swapAdapter(adapter, false)
    }
    if (previousListId != listId) {
      previousBindingsSignature = null
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
      if (previousDescriptorVersion.isEmpty() && descriptors.isNotEmpty()) {
        awaitInitialHosts()
      }
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
      refreshRequestPending = false
      settleRefresh(refreshThresholdPx())
    } else if (refreshRequestPending) {
      settleRefresh(refreshThresholdPx())
    } else if (!draggingRefresh) {
      settleRefresh(0f)
    }
    val generation = lifecycleGeneration
    recyclerView.post {
      if (recycling || generation != lifecycleGeneration) return@post
      trace("after-update-post", stateSnapshot())
      maybeRevealRecyclerView()
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
    trace(
      "attach-host",
      "slot=$slot itemKey=${host.itemKey} managed=${view.isManagedChild(host.view)} holder=${holders.containsKey(slot)}",
    )
    scheduleHostAttachment(host)
  }

  private fun scheduleHostAttachment(host: HybridRecyclerCellHostView) {
    val slot = host.slotId.toInt()
    val generation = lifecycleGeneration
    view.post {
      if (dropped || recycling || generation != lifecycleGeneration || hosts[slot] !== host) return@post
      attachHostIfMounted(host)
    }
  }

  private fun attachHostIfMounted(host: HybridRecyclerCellHostView) {
    val slot = host.slotId.toInt()
    val managed = view.isManagedChild(host.view)
    val holder = holders[slot]
    trace("attach-host-if-mounted", "slot=$slot managed=$managed holder=${holder != null}")
    if (!managed) return
    holder?.let { attachHostToHolder(host, it) } ?: layoutStickyHosts()
  }

  fun detachHost(host: HybridRecyclerCellHostView) {
    trace("detach-host", "slot=${host.slotId.toInt()} itemKey=${host.itemKey}")
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
      if (!recycling && generation == lifecycleGeneration) enqueueMeasuredSize(key, next)
    }
  }

  private fun enqueueMeasuredSize(key: String, next: Pair<Int, Int>) {
    if (dropped || (measuredSizes[key] == next && pendingMeasuredSizes[key] == null)) return
    pendingMeasuredSizes[key] = next
    if (measurementFlushPending) return
    measurementFlushPending = true
    val generation = lifecycleGeneration
    recyclerView.postOnAnimation {
      if (recycling || generation != lifecycleGeneration) return@postOnAnimation
      flushMeasuredSizes()
    }
  }

  private fun flushMeasuredSizes() {
    measurementFlushPending = false
    if (dropped || pendingMeasuredSizes.isEmpty()) return
    val batch = pendingMeasuredSizes.toMap()
    pendingMeasuredSizes.clear()
    val changedIndices = ArrayList<Int>()
    batch.forEach { (key, next) ->
      val index = descriptors.indexOfFirst { it.key == key }
      if (index < 0 || !isMeasurementAccepted(key, descriptors[index], next)) return@forEach
      if (measuredSizes[key] == next) return@forEach
      measuredSizes[key] = next
      changedIndices += index
    }
    trace("measurement-batch", "received=${batch.size} changed=${changedIndices.size}")
    applyMeasuredItemLayouts(changedIndices)
  }

  private fun isMeasurementAccepted(
    key: String,
    descriptor: ItemDescriptor,
    next: Pair<Int, Int>,
  ): Boolean {
    val columns = max(1, numColumns.toInt())
    val span = descriptor.span.toInt().coerceIn(1, columns)
    val crossAxisLimit = if (horizontal) recyclerView.height
      else (recyclerView.width * span / columns)
    val crossAxisSize = if (horizontal) next.second else next.first
    val primaryViewport = if (horizontal) recyclerView.width else recyclerView.height
    val primarySize = if (horizontal) next.first else next.second
    val estimated = estimatedSizePx(descriptor)
    val exceedsCrossAxis = crossAxisLimit > 0 && crossAxisSize > crossAxisLimit + 2
    val matchesViewportParkingSize = primaryViewport > 0 &&
      primarySize >= primaryViewport - 1 && estimated * 2 < primaryViewport
    if (exceedsCrossAxis || matchesViewportParkingSize) {
      trace(
        "measurement-rejected",
        "itemKey=$key measured=${next.first}x${next.second} crossLimit=$crossAxisLimit " +
          "primaryViewport=$primaryViewport estimated=$estimated",
      )
      return false
    }
    return true
  }

  private fun applyMeasuredItemLayouts(indices: List<Int>) {
    if (dropped) return
    val changed = indices.distinct().sorted()
    if (changed.isEmpty()) {
      maybeRevealRecyclerView()
      return
    }
    if (recyclerView.isComputingLayout) {
      val generation = lifecycleGeneration
      recyclerView.post {
        if (!recycling && generation == lifecycleGeneration) applyMeasuredItemLayouts(changed)
      }
      return
    }
    val changedSet = changed.toHashSet()
    holders.values.forEach { holder ->
      val index = holder.bindingIndex
      if (index !in changedSet) return@forEach
      val descriptor = descriptors.getOrNull(index) ?: return@forEach
      val measured = measuredSizes[descriptor.key] ?: return@forEach
      val size = if (horizontal) measured.first else measured.second
      updateHolderLayout(holder, descriptor, size)
      trace(
        "measured-holder-applied",
        "slot=${holder.slotId} index=$index itemKey=${descriptor.key} size=$size attached=${holder.container.parent != null}",
      )
    }
    recyclerView.requestLayout()
    var rangeStart = changed.first()
    var rangeEnd = rangeStart
    changed.drop(1).forEach { index ->
      if (index == rangeEnd + 1) {
        rangeEnd = index
      } else {
        adapter.notifyItemRangeChanged(rangeStart, rangeEnd - rangeStart + 1, sizeChangedPayload)
        rangeStart = index
        rangeEnd = index
      }
    }
    adapter.notifyItemRangeChanged(rangeStart, rangeEnd - rangeStart + 1, sizeChangedPayload)
    scheduleMeasuredLayoutFlush()
  }

  private fun scheduleMeasuredLayoutFlush() {
    if (measuredLayoutFlushPending || dropped || recycling) return
    measuredLayoutFlushPending = true
    val generation = lifecycleGeneration
    recyclerView.postOnAnimation {
      if (generation != lifecycleGeneration) return@postOnAnimation
      measuredLayoutFlushPending = false
      if (dropped || recycling) return@postOnAnimation
      val pendingBefore = recyclerView.hasPendingAdapterUpdates()
      recyclerView.scrollBy(0, 0)
      trace(
        "measurement-layout-flush",
        "pendingBefore=$pendingBefore pendingAfter=${recyclerView.hasPendingAdapterUpdates()}",
      )
      recyclerView.post(::maybeRevealRecyclerView)
    }
  }

  override fun prepareForRecycle() {
    trace("prepare-for-recycle-start", stateSnapshot())
    lifecycleGeneration += 1
    recycling = true
    bindingPublishPending = false
    measurementFlushPending = false
    measuredLayoutFlushPending = false
    stickyLayoutRetryPending = false
    RecyclerListRegistry.unregisterList(previousListId.ifEmpty { listId }, this)
    RecyclerTabCoordinatorRegistry.unregister(this)
    recyclerView.stopScroll()
    recyclerView.swapAdapter(null, true)
    recyclerView.scrollToPosition(0)
    hosts.clear()
    holders.values.forEach { holder -> holder.bindingIndex = -1 }
    measuredSizes.clear()
    pendingMeasuredSizes.clear()
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
    previousBindingsSignature = null
    nextBindingGeneration = 1L
    awaitingInitialHosts = true
    recyclerView.visibility = View.INVISIBLE
    scrollTraceAt = 0L
    scrollTraceDx = 0
    scrollTraceDy = 0
    resetRefresh()
    trace("prepare-for-recycle-end", stateSnapshot())
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
      .groupBy { it.bindingIndex }
      .values
      .mapNotNull { candidates -> candidates.maxByOrNull { it.bindingGeneration } }
      .map { holder ->
        val descriptor = descriptors[holder.bindingIndex]
        SlotBinding(holder.slotId.toDouble(), holder.bindingIndex.toDouble(), descriptor.key, descriptor.type)
      }
      .toMutableList()
    bindings.addAll(activeStickyBindings)
    val published = bindings.distinctBy { it.slotId }.sortedBy { it.slotId }.toTypedArray()
    val signature = published.joinToString(",") { "${it.slotId.toInt()}:${it.index.toInt()}:${it.itemKey}" }
    if (signature == previousBindingsSignature) return
    previousBindingsSignature = signature
    trace(
      "publish-bindings",
      "bindings=$signature ${stateSnapshot()}",
    )
    onSlotsChanged(published)
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
      val stickyHeight = max(1, height)
      if (hostView.parent === view) {
        val params = hostView.layoutParams
        if (params.width != ViewGroup.LayoutParams.MATCH_PARENT || params.height != stickyHeight) {
          hostView.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, stickyHeight)
        }
      } else {
        (hostView.parent as? ViewGroup)?.removeView(hostView)
        val remainingParent = hostView.parent
        if (remainingParent != null) {
          trace(
            "sticky-host-attach-deferred",
            "slot=${binding.slotId.toInt()} parent=${RecyclerTrace.objectId(remainingParent)}",
          )
          scheduleStickyLayoutRetry()
          top += height
          return@forEach
        }
        view.addView(
          hostView,
          FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, stickyHeight),
        )
      }
      hostView.visibility = View.VISIBLE
      hostView.translationY = y
      hostView.elevation = 20f + descriptor.stickyLevel.toFloat()
      top += height
    }
  }

  private fun scheduleStickyLayoutRetry() {
    if (stickyLayoutRetryPending || dropped || recycling) return
    stickyLayoutRetryPending = true
    val generation = lifecycleGeneration
    view.postOnAnimation {
      if (generation != lifecycleGeneration) return@postOnAnimation
      stickyLayoutRetryPending = false
      if (!dropped && !recycling) layoutStickyHosts()
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

  private fun scrollStateName(state: Int): String = when (state) {
    RecyclerView.SCROLL_STATE_DRAGGING -> "dragging"
    RecyclerView.SCROLL_STATE_SETTLING -> "settling"
    else -> "idle"
  }

  private fun traceScrollSample(force: Boolean = false) {
    val now = SystemClock.uptimeMillis()
    val elapsed = max(1L, now - scrollTraceAt)
    if (!force && scrollTraceAt != 0L && elapsed < 80L) return
    val range = visibleRange()
    trace(
      "scroll-sample",
      "state=${scrollStateName(recyclerView.scrollState)} dt=$elapsed dx=$scrollTraceDx dy=$scrollTraceDy " +
        "velocityX=${scrollTraceDx * 1000L / elapsed} velocityY=${scrollTraceDy * 1000L / elapsed} " +
        "offset=${currentOffset()} range=${range.first.toInt()}..${range.last.toInt()} children=${recyclerView.childCount}",
    )
    scrollTraceAt = now
    scrollTraceDx = 0
    scrollTraceDy = 0
  }

  private fun traceWindowCell(event: String, child: View) {
    val holder = recyclerView.getChildViewHolder(child) as? NativeHolder
    val host = holder?.container?.getChildAt(0)
    trace(
      event,
      "slot=${holder?.slotId ?: -1} index=${holder?.bindingIndex ?: -1} " +
        "cell=${child.left},${child.top},${child.width}x${child.height} " +
        "host=${host?.left ?: -1},${host?.top ?: -1},${host?.width ?: -1}x${host?.height ?: -1} " +
        "visible=${host?.visibility ?: -1}",
    )
  }

  private fun trace(event: String, details: String = "") {
    val suffix = if (details.isEmpty()) "" else " $details"
    RecyclerTrace.log(this, event, "generation=$lifecycleGeneration listId=$listId$suffix")
  }

  private fun stateSnapshot(): String {
    val holderState = holders.values.sortedBy { it.slotId }
      .joinToString(",") { "${it.slotId}:${it.bindingIndex}" }
    val hostState = hosts.keys.sorted().joinToString(",")
    return " recyclerChildren=${recyclerView.childCount} holders=[$holderState] hosts=[$hostState]"
  }

  private fun estimatedSizePx(descriptor: ItemDescriptor): Int =
    max(1, PixelUtil.toPixelFromDIP(max(1.0, descriptor.estimatedSize)).toInt())

  private fun attachHostToHolder(host: HybridRecyclerCellHostView, holder: NativeHolder) {
    val hostView = host.view
    if (dropped || !view.isManagedChild(hostView)) return
    if (hostView.parent !== holder.container) {
      (hostView.parent as? ViewGroup)?.removeView(hostView)
      holder.container.removeAllViews()
      holder.container.addView(
        hostView,
        FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT),
      )
    } else {
      hostView.layoutParams = FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
      )
    }
    hostView.translationX = 0f
    hostView.translationY = 0f
    hostView.visibility = View.VISIBLE
    holder.container.requestLayout()
    maybeRevealRecyclerView()
    trace(
      "attach-host-to-holder",
      "slot=${holder.slotId} host=${hostView.left},${hostView.top},${hostView.width}x${hostView.height} holder=${holder.container.width}x${holder.container.height}",
    )
  }

  private fun installRefreshGesture() {
    recyclerView.setOnTouchListener { _, event ->
      if (!refreshEnabled || horizontal || !tabActive || refreshing || refreshRequestPending || secondLevelOpen) {
        if (event.actionMasked == MotionEvent.ACTION_DOWN) {
          trace(
            "refresh-touch-disabled",
            "enabled=$refreshEnabled horizontal=$horizontal tabActive=$tabActive refreshing=$refreshing " +
              "requestPending=$refreshRequestPending secondLevelOpen=$secondLevelOpen",
          )
        }
        return@setOnTouchListener false
      }
      var consume = false
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          refreshAnimator?.cancel()
          refreshAnimator = null
          settlingRefresh = false
          openingSecondLevel = false
          closingSecondLevel = false
          downX = event.rawX
          downY = event.rawY
          pullGestureEligible = isAtRefreshTop()
          pullStartY = if (pullGestureEligible) event.rawY else null
          draggingRefresh = false
          trace(
            "refresh-touch-down",
            "eligible=$pullGestureEligible canScrollUp=${recyclerView.canScrollVertically(-1)} " +
              "range=${visibleRange()} y=${event.rawY.toInt()} offset=${currentOffset()} threshold=${refreshThresholdPx().toInt()}",
          )
        }
        MotionEvent.ACTION_MOVE -> {
          if (!pullGestureEligible) {
            if (!isAtRefreshTop() || event.rawY <= downY) return@setOnTouchListener false
            pullGestureEligible = true
            pullStartY = event.rawY
            downX = event.rawX
            downY = event.rawY
            trace(
              "refresh-armed-at-top",
              "y=${event.rawY.toInt()} offset=${currentOffset()} range=${visibleRange()}",
            )
            return@setOnTouchListener false
          }
          if (!draggingRefresh && recyclerView.canScrollVertically(-1)) {
            pullGestureEligible = false
            pullStartY = null
            trace("refresh-drag-abort", "reason=can-scroll-up y=${event.rawY.toInt()}")
            return@setOnTouchListener false
          }
          val distance = event.rawY - (pullStartY ?: return@setOnTouchListener false)
          val verticalDistance = event.rawY - downY
          val horizontalDistance = abs(event.rawX - downX)
          if (!draggingRefresh &&
            (distance <= touchSlop || verticalDistance <= 0 || abs(verticalDistance) <= horizontalDistance)
          ) return@setOnTouchListener false

          if (!draggingRefresh) {
            draggingRefresh = true
            cancelRecyclerTouch(event)
            recyclerView.parent?.requestDisallowInterceptTouchEvent(true)
            trace(
              "refresh-drag-start",
              "distance=${distance.toInt()} vertical=${verticalDistance.toInt()} horizontal=${horizontalDistance.toInt()} slop=${touchSlop.toInt()}",
            )
          }
          val limit = if (secondLevelEnabled) secondLevelThresholdPx() * 1.15f else refreshThresholdPx()
          setPullOffset(min(limit, max(0f, distance - touchSlop) * 0.5f))
          consume = true
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          if (draggingRefresh) {
            consume = true
            draggingRefresh = false
            val decision = when {
              event.actionMasked == MotionEvent.ACTION_CANCEL -> "cancel"
              secondLevelEnabled && pullOffset >= secondLevelThresholdPx() -> "second-level"
              pullOffset >= refreshThresholdPx() -> "refresh"
              else -> "settle"
            }
            trace(
              "refresh-release",
              "decision=$decision offset=${pullOffset.toInt()} refreshThreshold=${refreshThresholdPx().toInt()} secondThreshold=${secondLevelThresholdPx().toInt()}",
            )
            if (event.actionMasked == MotionEvent.ACTION_CANCEL) {
              settleRefresh(0f)
            } else if (secondLevelEnabled && pullOffset >= secondLevelThresholdPx()) {
              setPullOffset(secondLevelThresholdPx())
              onSecondLevelRequested()
            } else if (pullOffset >= refreshThresholdPx()) {
              refreshRequestPending = true
              setPullOffset(refreshThresholdPx())
              onRefreshRequested()
              scheduleRefreshRequestTimeout()
            } else {
              settleRefresh(0f)
            }
          }
          recyclerView.parent?.requestDisallowInterceptTouchEvent(false)
          pullGestureEligible = false
          pullStartY = null
        }
      }
      consume
    }
  }

  private fun isAtRefreshTop(): Boolean {
    if (!recyclerView.canScrollVertically(-1)) return true
    val range = visibleRange()
    return range.first <= 0.0 && currentOffset() <= 1
  }

  private fun cancelRecyclerTouch(event: MotionEvent) {
    val cancel = MotionEvent.obtain(event)
    cancel.action = MotionEvent.ACTION_CANCEL
    recyclerView.onTouchEvent(cancel)
    cancel.recycle()
    recyclerView.stopScroll()
  }

  private fun setPullOffset(value: Float) {
    pullOffset = value
    view.translationY = value
    val threshold = refreshThresholdPx()
    val phase = if (refreshing || refreshRequestPending) NativeRefreshPhase.REFRESHING
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
    val traceLimit = if (secondLevelEnabled) secondThreshold else threshold
    val traceBucket = ((value / max(1f, traceLimit)) * 10f).toInt().coerceIn(0, 12)
    if (traceBucket != refreshTraceBucket || phase != refreshTracePhase || secondPhase != secondLevelTracePhase) {
      trace(
        "refresh-offset",
        "px=${value.toInt()} threshold=${threshold.toInt()} secondThreshold=${secondThreshold.toInt()} " +
          "phase=$phase secondPhase=$secondPhase bucket=$traceBucket dragging=$draggingRefresh settling=$settlingRefresh",
      )
      refreshTraceBucket = traceBucket
      refreshTracePhase = phase
      secondLevelTracePhase = secondPhase
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
    ) {
      trace("refresh-animation-skip", "reason=same-target target=${target.toInt()} offset=${pullOffset.toInt()}")
      return
    }
    refreshAnimator?.cancel()
    refreshAnimator = null
    refreshAnimationTarget = target
    if (abs(pullOffset - target) < 0.5f) {
      settlingRefresh = false
      refreshAnimationTarget = null
      setPullOffset(target)
      return
    }
    trace("refresh-animation-start", "from=${pullOffset.toInt()} target=${target.toInt()} duration=140")
    settlingRefresh = target == 0f
    refreshAnimator = ValueAnimator.ofFloat(pullOffset, target).apply {
      duration = 140
      addUpdateListener { animator -> setPullOffset(animator.animatedValue as Float) }
      addListener(object : AnimatorListenerAdapter() {
        private var cancelled = false

        override fun onAnimationCancel(animation: Animator) {
          cancelled = true
          trace("refresh-animation-cancel", "target=${target.toInt()} offset=${pullOffset.toInt()}")
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
          trace("refresh-animation-end", "target=${target.toInt()} cancelled=$cancelled offset=${pullOffset.toInt()}")
        }
      })
      start()
    }
  }

  private fun scheduleRefreshRequestTimeout() {
    val requestGeneration = ++refreshRequestGeneration
    val generation = lifecycleGeneration
    view.postDelayed({
      if (recycling || generation != lifecycleGeneration || requestGeneration != refreshRequestGeneration) {
        return@postDelayed
      }
      if (!refreshRequestPending || refreshing) return@postDelayed
      refreshRequestPending = false
      trace("refresh-request-timeout", "offset=${pullOffset.toInt()}")
      settleRefresh(0f)
    }, 500L)
  }

  private fun settleSecondLevel(target: Float, opening: Boolean) {
    trace(
      "second-level-animation-start",
      "from=${pullOffset.toInt()} target=${target.toInt()} opening=$opening duration=260",
    )
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
          trace("second-level-animation-cancel", "target=${target.toInt()} offset=${pullOffset.toInt()}")
        }

        override fun onAnimationEnd(animation: Animator) {
          if (!cancelled) {
            openingSecondLevel = false
            closingSecondLevel = false
            setPullOffset(target)
          }
          if (refreshAnimator === animation) refreshAnimator = null
          trace("second-level-animation-end", "target=${target.toInt()} cancelled=$cancelled offset=${pullOffset.toInt()}")
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
    if (refreshEvents.phase != phase || refreshEvents.secondLevelPhase != secondPhase) {
      trace(
        "refresh-phase",
        "targetListId=$targetListId phase=${refreshEvents.phase}->$phase " +
          "secondPhase=${refreshEvents.secondLevelPhase}->$secondPhase offset=$offset progress=$progress secondProgress=$secondProgress",
      )
    }
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
    if (pullOffset != 0f || refreshAnimator != null ||
      refreshEvents.phase != NativeRefreshPhase.IDLE ||
      refreshEvents.secondLevelPhase != NativeSecondLevelPhase.IDLE
    ) {
      trace("refresh-reset", "offset=${pullOffset.toInt()} animator=${refreshAnimator?.isRunning == true}")
    }
    refreshAnimator?.cancel()
    refreshAnimator = null
    refreshAnimationTarget = null
    refreshRequestPending = false
    refreshRequestGeneration += 1
    draggingRefresh = false
    settlingRefresh = false
    openingSecondLevel = false
    closingSecondLevel = false
    pullGestureEligible = false
    pullStartY = null
    pullOffset = 0f
    refreshTraceBucket = -1
    refreshTracePhase = null
    secondLevelTracePhase = null
    view.translationY = 0f
    publishRefresh(NativeRefreshPhase.IDLE, 0.0, 0.0)
  }

  private fun awaitInitialHosts() {
    awaitingInitialHosts = true
    recyclerView.visibility = View.INVISIBLE
    val generation = lifecycleGeneration
    view.postDelayed({
      if (recycling || generation != lifecycleGeneration || !awaitingInitialHosts) return@postDelayed
      trace("initial-hosts-waiting", stateSnapshot())
      scheduleMeasuredLayoutFlush()
    }, 300L)
    view.postDelayed({
      if (recycling || generation != lifecycleGeneration || !awaitingInitialHosts) return@postDelayed
      awaitingInitialHosts = false
      recyclerView.visibility = View.VISIBLE
      trace("initial-hosts-revealed", "reason=hard-timeout ${stateSnapshot()}")
    }, 1200L)
  }

  private fun maybeRevealRecyclerView() {
    if (!awaitingInitialHosts) return
    if (descriptors.isEmpty()) {
      awaitingInitialHosts = false
      recyclerView.visibility = View.VISIBLE
      return
    }
    var visibleHolders = 0
    for (index in 0 until recyclerView.childCount) {
      val holder = recyclerView.getChildViewHolder(recyclerView.getChildAt(index)) as? NativeHolder ?: continue
      val bindingIndex = holder.bindingIndex
      val descriptor = descriptors.getOrNull(bindingIndex) ?: continue
      visibleHolders += 1
      val host = hosts[holder.slotId] ?: return
      if (host.view.parent !== holder.container || host.view.childCount == 0) return
      val measured = measuredSizes[descriptor.key] ?: return
      val expectedSize = if (horizontal) measured.first else measured.second
      val holderSize = if (horizontal) holder.container.width else holder.container.height
      val layoutSize = if (horizontal) holder.container.layoutParams?.width else holder.container.layoutParams?.height
      if (layoutSize != expectedSize || holderSize != expectedSize) return
    }
    if (visibleHolders == 0) return
    awaitingInitialHosts = false
    recyclerView.visibility = View.VISIBLE
    trace("initial-hosts-revealed", "reason=ready visibleHolders=$visibleHolders")
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
      val holder = NativeHolder(RecyclerCellContainer(parent.context, fillChildren = true), nextSlotId++)
      holders[holder.slotId] = holder
      trace("create-holder", "slot=${holder.slotId} viewType=$viewType")
      return holder
    }

    override fun onBindViewHolder(holder: NativeHolder, position: Int) {
      holders[holder.slotId] = holder
      holder.bindingIndex = position
      holder.bindingGeneration = nextBindingGeneration++
      val descriptor = descriptors[position]
      val measured = measuredSizes[descriptor.key]
      val size = measured?.let { if (horizontal) it.first else it.second } ?: estimatedSizePx(descriptor)
      updateHolderLayout(holder, descriptor, size)
      hosts[holder.slotId]?.let { attachHostToHolder(it, holder) }
      trace(
        "bind-holder",
        "slot=${holder.slotId} index=$position itemKey=${descriptor.key} host=${hosts.containsKey(holder.slotId)} attached=${holder.container.parent != null}",
      )
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
        trace("bind-holder-size", "slot=${holder.slotId} index=$position itemKey=${descriptor.key} size=$size")
        return
      }
      super.onBindViewHolder(holder, position, payloads)
    }

    override fun onViewRecycled(holder: NativeHolder) {
      trace(
        "recycle-holder",
        "slot=${holder.slotId} index=${holder.bindingIndex} host=${hosts.containsKey(holder.slotId)}",
      )
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
    var bindingGeneration: Long = 0L
  }
}
