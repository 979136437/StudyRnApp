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
      'if (!view.isManagedChild(host.view)) return',
    );
    expect(androidSource).toContain(
      'if (dropped || !view.isManagedChild(hostView)) return',
    );
    expect(androidSource).toContain(
      'if (hostView.parent === holder.container) {',
    );
    expect(iosSource).toContain(
      'DispatchQueue.main.async { [weak self, weak host] in',
    );
  });

  it('updates measured Android holders without rebinding cells during layout', () => {
    const source = readFileSync(androidRecyclerListSource, 'utf8');

    expect(source).toContain(
      'if (!recycling && generation == lifecycleGeneration) applyMeasuredSize(key, next)',
    );
    expect(source).toContain('if (recyclerView.isComputingLayout) {');
    expect(source).toContain(
      'if (!recycling && generation == lifecycleGeneration) applyMeasuredItemLayout(key)',
    );
    expect(source).toContain('updateHolderLayout(holder, descriptor, size)');
    expect(source).toContain(
      'StaggeredGridLayoutManager.LayoutParams(baseParams)',
    );
    expect(source).toContain(
      'adapter.notifyItemChanged(index, sizeChangedPayload)',
    );
    expect(source).toContain(
      'override fun onBindViewHolder(holder: NativeHolder, position: Int, payloads: MutableList<Any>)',
    );
  });

  it('starts Android pull only from a top-positioned gesture and moves the complete host', () => {
    const source = readFileSync(androidRecyclerListSource, 'utf8');

    expect(source).toContain(
      'pullGestureEligible = !recyclerView.canScrollVertically(-1)',
    );
    expect(source).toContain(
      'pullStartY = if (pullGestureEligible) event.rawY else null',
    );
    expect(source).toContain(
      'if (!pullGestureEligible) return@setOnTouchListener false',
    );
    expect(source).toContain('distance <= touchSlop');
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

    expect(source).toContain('const columnSpan = Math.min(');
    expect(source).toContain('width: cellWidth');
    expect(androidCell).toContain('clipChildren = true');
    expect(androidCell).toContain('clipToPadding = true');
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

  it('attaches Android hosts as soon as Fabric adds the managed child', () => {
    const source = readFileSync(androidRecyclerListSource, 'utf8');
    const managedChildCallback = source.slice(
      source.indexOf('view.onManagedChildAdded = { child ->'),
      source.indexOf('recyclerView.adapter = adapter'),
    );

    expect(managedChildCallback).toContain(
      'hosts.values.firstOrNull { it.view === child }?.let(::attachHostIfMounted)',
    );
    expect(managedChildCallback).not.toContain('view.post {');
  });

  it('keeps masonry columns stable and activates sticky hosts only after crossing the top', () => {
    const androidSource = readFileSync(androidRecyclerListSource, 'utf8');
    const iosLayout = readFileSync(iosLayoutSource, 'utf8');

    expect(androidSource).toContain(
      'masonry.gapStrategy = StaggeredGridLayoutManager.GAP_HANDLING_NONE',
    );
    expect(androidSource).toContain('private fun replaceActiveStickyBindings');
    expect(androidSource).toContain('hasCrossedTop(it, stackOffset)');
    expect(iosLayout).toContain('private var masonryStarts: [String: Int]');
    expect(iosLayout).toContain('masonryStarts[descriptor.key] = start');
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
    expect(androidSource).toContain('duration = 140');
    expect(iosSource).toContain(
      'secondLevelEnabled ? secondLevelThreshold * 1.15 : refreshThreshold',
    );
    expect(iosSource).toContain('withDuration: 0.15');
  });
});
