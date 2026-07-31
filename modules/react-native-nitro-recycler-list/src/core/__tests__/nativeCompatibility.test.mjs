import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const generatedComponents = [
  new URL(
    '../../../nitrogen/generated/shared/c++/views/HybridRecyclerListViewComponent.cpp',
    import.meta.url,
  ),
  new URL(
    '../../../nitrogen/generated/shared/c++/views/HybridRecyclerCellHostViewComponent.cpp',
    import.meta.url,
  ),
];
const recyclerListSource = new URL('../../RecyclerList.tsx', import.meta.url);
const androidRecyclerListSource = new URL(
  '../../../android/src/main/java/com/margelo/nitro/recyclerlist/HybridRecyclerListView.kt',
  import.meta.url,
);
const iosRecyclerListSource = new URL(
  '../../../ios/HybridRecyclerListView.swift',
  import.meta.url,
);
const iosLayoutSource = new URL(
  '../../../ios/RecyclerCollectionLayout.swift',
  import.meta.url,
);
const iosCellSource = new URL(
  '../../../ios/RecyclerCellContainer.swift',
  import.meta.url,
);
const iosRefreshTransitionSource = new URL(
  '../../../ios/RecyclerListRefreshTransitionDriver.swift',
  import.meta.url,
);
const androidCellSource = new URL(
  '../../../android/src/main/java/com/margelo/nitro/recyclerlist/RecyclerCellContainer.kt',
  import.meta.url,
);

describe('React Native 0.86 compatibility', () => {
  it.each(generatedComponents)(
    'avoids the dangling getConcreteSharedProps reference in %s',
    (component) => {
      const source = readFileSync(component, 'utf8');

      expect(source).not.toContain(
        'concreteShadowNode.getConcreteSharedProps()',
      );
      expect(source).toContain('concreteShadowNode.getProps()');
    },
  );

  it('registers Reanimated events without passing handler objects to Fabric', () => {
    const source = readFileSync(recyclerListSource, 'utf8');

    expect(source).toContain(
      "registerForEvents(\n      eventSourceTag,\n      'onPull',",
    );
    expect(source).toContain("eventSourceTag,\n      'onTabScroll',");
    expect(source).toContain('<NativeRecyclerListRefreshEventSource');
    expect(source).not.toContain('onPull={');
    expect(source).not.toContain('onTabScroll={');
  });

  it('defers native host reparenting until Fabric finishes mounting', () => {
    const androidSource = readFileSync(androidRecyclerListSource, 'utf8');
    const iosSource = readFileSync(iosRecyclerListSource, 'utf8');

    expect(androidSource).toContain('view.post {');
    expect(androidSource).toContain(
      'if (dropped || recycling || generation != lifecycleGeneration || hosts[slot] !== host) return@post',
    );
    expect(androidSource).toContain(
      'val managed = view.isManagedChild(host.view)',
    );
    expect(androidSource).toContain('if (!managed) return');
    expect(androidSource).toContain(
      'if (dropped || !view.isManagedChild(hostView)) return',
    );
    expect(androidSource).toContain('scheduleHostAttachment(host)');
    expect(iosSource).toContain(
      'DispatchQueue.main.async { [weak self, weak host] in',
    );
  });

  it('updates measured Android holders without rebinding cells during layout', () => {
    const source = readFileSync(androidRecyclerListSource, 'utf8');

    expect(source).toContain(
      'if (!recycling && generation == lifecycleGeneration) enqueueMeasuredSize(key, next)',
    );
    expect(source).toContain('if (recyclerView.isComputingLayout) {');
    expect(source).toContain(
      'if (!recycling && generation == lifecycleGeneration) applyMeasuredItemLayouts(changed)',
    );
    expect(source).toContain('recyclerView.postOnAnimation');
    expect(source).toContain('"measurement-batch"');
    expect(source).toContain('"measured-holder-applied"');
    expect(source).toContain('recyclerView.requestLayout()');
    expect(source).toContain('recyclerView.hasPendingAdapterUpdates()');
    expect(source).toContain('recyclerView.scrollBy(0, 0)');
    expect(source).toContain('"measurement-layout-flush"');
    expect(source).toContain('updateHolderLayout(holder, descriptor, size)');
    expect(source).toContain(
      'StaggeredGridLayoutManager.LayoutParams(baseParams)',
    );
    expect(source).toContain(
      'adapter.notifyItemRangeChanged(rangeStart, rangeEnd - rangeStart + 1, sizeChangedPayload)',
    );
    expect(source).toContain('"measurement-rejected"');
    expect(source).toContain('crossAxisSize > crossAxisLimit + 2');
    expect(source).toContain(
      'override fun onBindViewHolder(holder: NativeHolder, position: Int, payloads: MutableList<Any>)',
    );
  });

  it('starts Android pull only from a top-positioned gesture and moves the complete host', () => {
    const source = readFileSync(androidRecyclerListSource, 'utf8');

    expect(source).toContain('pullGestureEligible = isAtRefreshTop()');
    expect(source).toContain(
      'pullStartY = if (pullGestureEligible) event.rawY else null',
    );
    expect(source).toContain(
      'if (!isAtRefreshTop() || event.rawY <= downY) return@setOnTouchListener false',
    );
    expect(source).toContain('distance <= touchSlop');
    expect(source).toContain('"refresh-armed-at-top"');
    expect(source).toContain('cancelRecyclerTouch(event)');
    expect(source).toContain('consume = true');
    expect(source).toContain('view.translationY = value');
    expect(source).not.toContain('recyclerView.translationY = value');
  });

  it('keeps Android React hosts mounted while their holders are recycled', () => {
    const source = readFileSync(androidRecyclerListSource, 'utf8');
    const onViewRecycled = source.slice(
      source.indexOf('override fun onViewRecycled(holder: NativeHolder)'),
      source.indexOf('private class NativeHolder'),
    );

    expect(onViewRecycled).toContain('holder.container.clearFocus()');
    expect(onViewRecycled).not.toContain('holder.container.removeAllViews()');
    expect(onViewRecycled).not.toContain('holder.bindingIndex = -1');
    expect(onViewRecycled).not.toContain('publishBindings()');
  });

  it('invalidates the iOS layout from the main queue', () => {
    const source = readFileSync(iosRecyclerListSource, 'utf8');

    expect(source).toContain('DispatchQueue.main.async { [weak self] in');
    expect(source).toContain(
      'self.view.collectionView.collectionViewLayout.invalidateLayout()',
    );
  });

  it('converts React layout DIP values to Android pixels', () => {
    const source = readFileSync(androidRecyclerListSource, 'utf8');

    expect(source).toContain('PixelUtil.toPixelFromDIP(width).toInt()');
    expect(source).toContain('PixelUtil.toPixelFromDIP(height).toInt()');
    expect(source).toContain('estimatedSizePx(descriptor)');
    expect(source).not.toContain('descriptor.estimatedSize.toInt()');
  });

  it('retains and re-registers holders when the HybridView is recycled', () => {
    const source = readFileSync(androidRecyclerListSource, 'utf8');
    const prepareForRecycle = source.slice(
      source.indexOf('override fun prepareForRecycle()'),
      source.indexOf('override fun onDropView()'),
    );

    expect(prepareForRecycle).not.toContain('holders.clear()');
    expect(prepareForRecycle).toContain(
      'holders.values.forEach { holder -> holder.bindingIndex = -1 }',
    );
    expect(prepareForRecycle).toContain('previousListId = ""');
    expect(prepareForRecycle).toContain('stickySlots.clear()');
    expect(prepareForRecycle).toContain('recyclerView.swapAdapter(null, true)');
    expect(prepareForRecycle).not.toContain('adapter.notifyDataSetChanged()');
    expect(source).toContain('recyclerView.swapAdapter(adapter, false)');
    expect(source).toContain('holders[holder.slotId] = holder');
  });

  it('invalidates callbacks and registrations when native views enter the Fabric recycle pool', () => {
    const androidSource = readFileSync(androidRecyclerListSource, 'utf8');
    const iosSource = readFileSync(iosRecyclerListSource, 'utf8');

    expect(androidSource).toContain('lifecycleGeneration += 1');
    expect(androidSource).toContain('generation != lifecycleGeneration');
    expect(androidSource).toContain(
      'override fun getItemCount(): Int = if (recycling) 0 else descriptors.size',
    );
    expect(iosSource).toContain('lifecycleGeneration += 1');
    expect(iosSource).toContain('generation == self.lifecycleGeneration');
  });

  it('recycles attached Android holders only when entering the Fabric recycle pool', () => {
    const source = readFileSync(androidRecyclerListSource, 'utf8');
    const prepareForRecycle = source.slice(
      source.indexOf('override fun prepareForRecycle()'),
      source.indexOf('override fun onDropView()'),
    );
    const onDropView = source.slice(
      source.indexOf('override fun onDropView()'),
      source.indexOf('private fun configureLayoutManager()'),
    );

    expect(prepareForRecycle).toContain('recyclerView.swapAdapter(null, true)');
    expect(onDropView).toContain('recyclerView.swapAdapter(null, false)');
    expect(onDropView).not.toContain('recyclerView.adapter = null');
  });

  it('sizes React cell hosts to their native column span', () => {
    const source = readFileSync(recyclerListSource, 'utf8');
    const androidCell = readFileSync(androidCellSource, 'utf8');
    const iosCell = readFileSync(iosCellSource, 'utf8');
    const iosList = readFileSync(iosRecyclerListSource, 'utf8');

    expect(source).toContain('const columnSpan = Math.min(');
    expect(source).toContain('width: cellWidth');
    expect(androidCell).toContain('clipChildren = true');
    expect(androidCell).toContain('clipToPadding = true');
    expect(iosCell).toContain('override func layoutSubviews()');
    expect(iosCell).toContain('hostView.frame = contentView.bounds');
    expect(iosList).toContain('cell.setNeedsLayout()');
  });

  it('uses overscan and publishes Android binding snapshots without waiting another frame', () => {
    const source = readFileSync(androidRecyclerListSource, 'utf8');
    const iosLayout = readFileSync(iosLayoutSource, 'utf8');
    const scheduleBindingsPublish = source.slice(
      source.indexOf('private fun scheduleBindingsPublish()'),
      source.indexOf('private fun publishBindings()'),
    );

    expect(source).toContain('private fun scheduleBindingsPublish()');
    expect(scheduleBindingsPublish).toContain('recyclerView.post {');
    expect(scheduleBindingsPublish).not.toContain('postOnAnimation');
    expect(source).toContain('recyclerView.setItemViewCacheSize');
    expect(source).toContain(
      'recyclerView.recycledViewPool.setMaxRecycledViews(viewType, 32)',
    );
    expect(source).not.toContain(
      'recyclerView.recycledViewPool.setMaxRecycledViews(0, 32)',
    );
    expect(iosLayout).toContain('var overscan: CGFloat = 1');
    expect(iosLayout).toContain('$0.frame.intersects(expandedRect)');
  });

  it('keeps recycled Android hosts inside their holder bounds', () => {
    const source = readFileSync(androidRecyclerListSource, 'utf8');
    const cellSource = readFileSync(androidCellSource, 'utf8');
    const managedChildCallback = source.slice(
      source.indexOf('view.onManagedChildAdded = { child ->'),
      source.indexOf('recyclerView.adapter = adapter'),
    );

    expect(managedChildCallback).toContain(
      'val host = hosts.values.firstOrNull { it.view === child }',
    );
    expect(managedChildCallback).toContain('host?.let(::attachHostIfMounted)');
    expect(source).toContain(
      'RecyclerCellContainer(parent.context, fillChildren = true)',
    );
    expect(source).toContain(
      'FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)',
    );
    expect(source).not.toContain('captureHostMeasurement(host)');
    expect(cellSource).toContain(
      'child?.addOnLayoutChangeListener(fillChildLayoutListener)',
    );
    expect(cellSource).toContain(
      'if (!fillChildren) {\n      super.onLayout(changed, left, top, right, bottom)',
    );
    expect(cellSource).toContain('layoutChildWithinHolder(getChildAt(index))');
    expect(cellSource).toContain(
      'preferredHorizontalInsets = leftInset to rightInset',
    );
    expect(cellSource).toContain(
      'val (leftInset, rightInset) = preferredHorizontalInsets ?: (0 to 0)',
    );
    expect(cellSource).toContain(
      'child.layout(nextLeft, 0, nextLeft + nextWidth, nextHeight)',
    );
    expect(cellSource).toContain('"holder-child-corrected"');
    expect(cellSource).toContain('var passThroughTouches = false');
    expect(cellSource).toContain('if (passThroughTouches) return false');
    expect(source).toContain('host.view.passThroughTouches = true');
    expect(source).toContain('hostView.passThroughTouches = true');
    expect(source).toContain('hostView.passThroughTouches = false');
    expect(cellSource).not.toContain('override fun layout(');
  });

  it('keeps masonry columns stable and activates sticky hosts only after crossing the top', () => {
    const androidSource = readFileSync(androidRecyclerListSource, 'utf8');
    const iosLayout = readFileSync(iosLayoutSource, 'utf8');

    expect(androidSource).toContain(
      'masonry.gapStrategy = StaggeredGridLayoutManager.GAP_HANDLING_NONE',
    );
    expect(androidSource).toContain('private fun replaceActiveStickyBindings');
    expect(androidSource).toContain('hasCrossedTop(it, stackOffset)');
    expect(androidSource).toContain(
      'val activeMarker = descriptors.indices.lastOrNull',
    );
    expect(androidSource).not.toContain(
      '(0..min(firstVisible, descriptors.lastIndex)).lastOrNull',
    );
    expect(androidSource).toContain('if (hostView.parent === view)');
    expect(androidSource).toContain('val remainingParent = hostView.parent');
    expect(androidSource).toContain('"sticky-host-attach-deferred"');
    expect(androidSource).toContain('"sticky-bindings-changed"');
    expect(androidSource).toContain('"sticky-host-hidden"');
    expect(androidSource).toContain('"sticky-host-reparent"');
    expect(androidSource).toContain('"sticky-host-attached"');
    expect(androidSource).toContain('"sticky-host-parked"');
    expect(androidSource).toContain('"sticky-layout"');
    expect(androidSource).toContain('"sticky-layout-retry-scheduled"');
    expect(androidSource).toContain('"sticky-layout-retry-run"');
    expect(androidSource).toContain('now - stickyTraceAt < 80L');
    expect(androidSource).toContain(
      'bindings.addAll(stickyBindingsForDescriptors())',
    );
    expect(androidSource).toContain(
      'stickySlots.getOrPut(stickySlotKey(descriptor.key))',
    );
    expect(androidSource).toContain(
      'activeStickyBindings.none { it.slotId.toInt() == slot }',
    );
    expect(androidSource).toContain('scheduleStickyLayoutRetry()');
    expect(androidSource).toContain(
      'if (generation != lifecycleGeneration) return@postOnAnimation',
    );
    expect(iosLayout).toContain('private var masonryStarts: [String: Int]');
    expect(iosLayout).toContain('masonryStarts[descriptor.key] = start');
  });

  it('does not restart an active iOS refresh transition for the same target', () => {
    const iosList = readFileSync(iosRecyclerListSource, 'utf8');
    const transition = readFileSync(iosRefreshTransitionSource, 'utf8');

    expect(transition).toContain(
      'var target: Double? { isRunning ? targetValue : nil }',
    );
    expect(iosList).toContain(
      'if refreshTransition.target == Double(inset) { return }',
    );
  });

  it('keeps React host order stable and prefetches masonry slots beyond the viewport', () => {
    const androidSource = readFileSync(androidRecyclerListSource, 'utf8');
    const iosSource = readFileSync(iosRecyclerListSource, 'utf8');

    expect(androidSource).toContain('sortedBy { it.slotId }.toTypedArray()');
    expect(androidSource).not.toContain('sortedBy { it.index }.toTypedArray()');
    expect(androidSource).toContain(
      'private inner class OverscanStaggeredGridLayoutManager',
    );
    expect(androidSource).toContain(
      'layoutPrefetchRegistry.addPosition(position, rowDistance)',
    );
    expect(iosSource).toContain('sorted { $0.slotId < $1.slotId }');
  });

  it('keeps ordinary pull distance within the refresh header and settles promptly', () => {
    const androidSource = readFileSync(androidRecyclerListSource, 'utf8');
    const iosSource = readFileSync(iosRecyclerListSource, 'utf8');

    expect(androidSource).toContain(
      'else refreshThresholdPx()\n          setPullOffset',
    );
    expect(androidSource).toContain('refreshAnimationTarget?.let');
    expect(androidSource).toContain('refreshRequestPending = true');
    expect(androidSource).toContain('else if (refreshRequestPending) {');
    expect(androidSource).toContain('"refresh-request-timeout"');
    expect(androidSource).toContain('duration = 140');
    expect(androidSource).toContain('"refresh-release"');
    expect(androidSource).toContain('"refresh-offset"');
    expect(androidSource).toContain('"refresh-animation-end"');
    expect(androidSource).toContain('refreshEnabled=$refreshEnabled');
    expect(readFileSync(recyclerListSource, 'utf8')).toContain(
      "logNitroRecyclerTrace('JS refresh-requested'",
    );
    expect(readFileSync(recyclerListSource, 'utf8')).toContain(
      "'JS refresh-prop'",
    );
    expect(iosSource).toContain(
      'secondLevelEnabled ? secondLevelThreshold * 1.15 : refreshThreshold',
    );
    expect(iosSource).toContain('withDuration: 0.15');
  });

  it('traces Android fast-scroll state, velocity, and cell window changes', () => {
    const androidSource = readFileSync(androidRecyclerListSource, 'utf8');

    expect(androidSource).toContain('override fun onScrollStateChanged');
    expect(androidSource).toContain('traceScrollSample(force = true)');
    expect(androidSource).toContain('"scroll-sample"');
    expect(androidSource).toContain('velocityY=');
    expect(androidSource).toContain('"cell-window-attach"');
    expect(androidSource).toContain('"cell-window-detach"');
    expect(androidSource).toContain(
      'if (signature == previousBindingsSignature) return',
    );
    expect(androidSource).toContain(
      '.mapNotNull { candidates -> candidates.maxByOrNull { it.bindingGeneration } }',
    );
    expect(androidSource).toContain('recyclerView.visibility = View.INVISIBLE');
    expect(androidSource).toContain('"initial-hosts-revealed"');
    expect(androidSource).toContain('"initial-hosts-waiting"');
    expect(androidSource).toContain('reason=hard-timeout');
    expect(androidSource).toContain(
      'if (layoutSize != expectedSize || holderSize != expectedSize) return',
    );
  });
});
