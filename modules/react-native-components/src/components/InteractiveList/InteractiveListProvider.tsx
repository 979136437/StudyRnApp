import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  View,
} from 'react-native';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSharedValue } from 'react-native-reanimated';

import {
  buildItemLayouts,
  findReorderTarget,
  getAutoScrollSpeed,
  getReorderOffsets,
  reorderItems,
} from '../../core/interactive-list-layout';
import {
  InteractiveListContext,
  type InteractiveListContextValue,
} from '../../react/interactive-list-context';
import type {
  InteractiveListProviderProps,
  InteractiveListScrollHandle,
} from './types';

const DEFAULT_EDGE_SIZE = 72;
const DEFAULT_ESTIMATED_ITEM_SIZE = 72;
const DEFAULT_HORIZONTAL_TOLERANCE = 12;
const DEFAULT_LONG_PRESS_DURATION = 280;
const DEFAULT_MAX_AUTO_SCROLL_SPEED = 14;
const ITEM_SIZE_EPSILON = 0.5;

interface ActiveDrag {
  index: number;
  key: string;
  targetIndex: number;
}

export function InteractiveListProvider<T>({
  autoScrollEdgeSize = DEFAULT_EDGE_SIZE,
  autoScrollMaxSpeed = DEFAULT_MAX_AUTO_SCROLL_SPEED,
  children,
  data,
  estimatedItemSize = DEFAULT_ESTIMATED_ITEM_SIZE,
  horizontalGestureTolerance = DEFAULT_HORIZONTAL_TOLERANCE,
  keyExtractor,
  longPressDurationMs = DEFAULT_LONG_PRESS_DURATION,
  onReorder,
  style,
}: InteractiveListProviderProps<T>): React.JSX.Element {
  const [displayData, setDisplayData] = useState<T[]>(() => [...data]);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [commitRevision, setCommitRevision] = useState(0);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [offsets, setOffsets] = useState<Record<string, number>>({});
  const dataRef = useRef(displayData);
  const activeDragRef = useRef<ActiveDrag | null>(null);
  const measuredLengthsRef = useRef(new Map<string, number>());
  const layoutsRef = useRef(
    buildItemLayouts([], measuredLengthsRef.current, estimatedItemSize),
  );
  const listHandleRef = useRef<InteractiveListScrollHandle | null>(null);
  const openKeyRef = useRef<string | null>(null);
  const swipeableRefs = useRef(new Map<string, SwipeableMethods>());
  const viewportRef = useRef<View>(null);
  const viewportBoundsRef = useRef({ end: 0, start: 0 });
  const viewportHeightRef = useRef(0);
  const contentLengthRef = useRef(0);
  const scrollOffsetRef = useRef(0);
  const autoScrollSpeedRef = useRef(0);
  const autoScrollFrameRef = useRef<number | null>(null);
  const scrollOffset = useSharedValue(0);
  const activeTranslation = useSharedValue(0);
  const activeTargetOffset = useSharedValue(0);

  dataRef.current = displayData;
  activeDragRef.current = activeDrag;

  const getKeys = useCallback(
    (items: readonly T[]): string[] =>
      items.map((item, index) => keyExtractor(item, index)),
    [keyExtractor],
  );
  const getLayouts = useCallback(
    (items: readonly T[]) =>
      buildItemLayouts(
        getKeys(items),
        measuredLengthsRef.current,
        estimatedItemSize,
      ),
    [estimatedItemSize, getKeys],
  );

  useEffect(() => {
    if (activeDragRef.current === null) {
      const nextData = [...data];
      dataRef.current = nextData;
      setDisplayData(nextData);
    }
  }, [data]);

  const closeOpenRow = useCallback((): void => {
    const openKey = openKeyRef.current;
    if (openKey !== null) {
      swipeableRefs.current.get(openKey)?.close();
      openKeyRef.current = null;
    }
  }, []);

  useEffect(() => {
    const validKeys = new Set(getKeys(data));
    const openKey = openKeyRef.current;
    if (openKey !== null && !validKeys.has(openKey)) {
      swipeableRefs.current.get(openKey)?.close();
      openKeyRef.current = null;
    }
    for (const key of measuredLengthsRef.current.keys()) {
      if (!validKeys.has(key)) {
        measuredLengthsRef.current.delete(key);
        swipeableRefs.current.delete(key);
      }
    }
  }, [data, getKeys]);

  const stopAutoScroll = useCallback((): void => {
    autoScrollSpeedRef.current = 0;
    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  }, []);

  const updateTarget = useCallback(
    (key: string, activeCenter: number): void => {
      const active = activeDragRef.current;
      if (!active || active.key !== key) {
        return;
      }
      const items = dataRef.current;
      const keys = getKeys(items);
      const layouts = getLayouts(items);
      contentLengthRef.current = layouts.reduce(
        (total, layout) => total + layout.length,
        0,
      );
      const targetIndex = findReorderTarget(
        layouts,
        active.index,
        activeCenter,
      );
      if (targetIndex === active.targetIndex) {
        return;
      }
      const nextActive = { ...active, targetIndex };
      activeDragRef.current = nextActive;
      setActiveDrag(nextActive);
      const calculatedOffsets = getReorderOffsets(
        layouts,
        active.index,
        targetIndex,
      );
      const nextOffsets: Record<string, number> = {};
      keys.forEach((itemKey, index) => {
        nextOffsets[itemKey] = calculatedOffsets[index];
      });
      activeTargetOffset.value = calculatedOffsets[active.index] ?? 0;
      setOffsets(nextOffsets);
    },
    [activeTargetOffset, getKeys, getLayouts],
  );

  const runAutoScroll = useCallback((): void => {
    autoScrollFrameRef.current = requestAnimationFrame(() => {
      const speed = autoScrollSpeedRef.current;
      const active = activeDragRef.current;
      if (speed === 0 || !active) {
        autoScrollFrameRef.current = null;
        return;
      }
      const maxOffset = Math.max(
        0,
        contentLengthRef.current - viewportHeightRef.current,
      );
      const nextOffset = Math.min(
        maxOffset,
        Math.max(0, scrollOffsetRef.current + speed),
      );
      const delta = nextOffset - scrollOffsetRef.current;
      if (delta !== 0) {
        scrollOffsetRef.current = nextOffset;
        scrollOffset.value = nextOffset;
        activeTranslation.value += delta;
        listHandleRef.current?.scrollToOffset({
          animated: false,
          offset: nextOffset,
        });
        const activeLayout = getLayouts(dataRef.current)[active.index];
        if (activeLayout) {
          updateTarget(
            active.key,
            activeLayout.offset +
              activeLayout.length / 2 +
              activeTranslation.value,
          );
        }
      }
      runAutoScroll();
    });
  }, [activeTranslation, getLayouts, scrollOffset, updateTarget]);

  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  const handleDragStart = useCallback(
    (key: string, index: number): void => {
      closeOpenRow();
      stopAutoScroll();
      listHandleRef.current?.prepareForLayoutAnimationRender?.();
      const nextActive = { index, key, targetIndex: index };
      activeDragRef.current = nextActive;
      activeTargetOffset.value = 0;
      setOffsets({});
      setActiveDrag(nextActive);
    },
    [activeTargetOffset, closeOpenRow, stopAutoScroll],
  );

  const handleDragMove = useCallback(
    (key: string, center: number, absoluteY: number): void => {
      updateTarget(key, center);
      const bounds = viewportBoundsRef.current;
      const speed = getAutoScrollSpeed({
        edgeSize: autoScrollEdgeSize,
        maxSpeed: autoScrollMaxSpeed,
        pointerY: absoluteY,
        viewportEnd: bounds.end,
        viewportStart: bounds.start,
      });
      autoScrollSpeedRef.current = speed;
      if (speed !== 0 && autoScrollFrameRef.current === null) {
        runAutoScroll();
      } else if (speed === 0 && autoScrollFrameRef.current !== null) {
        cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
    },
    [autoScrollEdgeSize, autoScrollMaxSpeed, runAutoScroll, updateTarget],
  );

  const resetDrag = useCallback((): void => {
    stopAutoScroll();
    activeDragRef.current = null;
    activeTargetOffset.value = 0;
    activeTranslation.value = 0;
    setOffsets({});
    setActiveDrag(null);
  }, [activeTargetOffset, activeTranslation, stopAutoScroll]);

  const handleDrop = useCallback(
    (key: string): void => {
      const active = activeDragRef.current;
      if (!active || active.key !== key) {
        return;
      }
      const { index, targetIndex } = active;
      if (index === targetIndex) {
        resetDrag();
        return;
      }
      const nextData = reorderItems(dataRef.current, index, targetIndex);
      listHandleRef.current?.prepareForLayoutAnimationRender?.();
      dataRef.current = nextData;
      setCommitRevision((current) => current + 1);
      setDisplayData(nextData);
      resetDrag();
      onReorder(nextData, index, targetIndex);
    },
    [onReorder, resetDrag],
  );

  const handleDragCancel = useCallback(
    (key: string): void => {
      if (activeDragRef.current?.key === key) {
        resetDrag();
      }
    },
    [resetDrag],
  );
  const handleItemLayout = useCallback((key: string, length: number): void => {
    const previousLength = measuredLengthsRef.current.get(key);
    if (
      previousLength === undefined ||
      Math.abs(previousLength - length) > ITEM_SIZE_EPSILON
    ) {
      measuredLengthsRef.current.set(key, length);
      setLayoutRevision((current) => current + 1);
    }
  }, []);
  const handleRegisterSwipeable = useCallback(
    (key: string, methods: SwipeableMethods | null): void => {
      if (methods) {
        swipeableRefs.current.set(key, methods);
      } else {
        swipeableRefs.current.delete(key);
        if (openKeyRef.current === key) {
          openKeyRef.current = null;
        }
      }
    },
    [],
  );
  const handleSwipeableWillOpen = useCallback((key: string): void => {
    const previousKey = openKeyRef.current;
    if (previousKey !== null && previousKey !== key) {
      swipeableRefs.current.get(previousKey)?.close();
    }
    openKeyRef.current = key;
  }, []);
  const handleSwipeableClose = useCallback((key: string): void => {
    if (openKeyRef.current === key) {
      openKeyRef.current = null;
    }
  }, []);
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
      const offset = event.nativeEvent.contentOffset.y;
      scrollOffsetRef.current = offset;
      scrollOffset.value = offset;
    },
    [scrollOffset],
  );
  const handleScrollBeginDrag = useCallback((): void => {
    if (activeDragRef.current === null) {
      closeOpenRow();
    }
  }, [closeOpenRow]);
  const handleViewportLayout = useCallback((event: LayoutChangeEvent): void => {
    viewportHeightRef.current = event.nativeEvent.layout.height;
    viewportRef.current?.measureInWindow((_x, y, _width, height) => {
      viewportBoundsRef.current = { end: y + height, start: y };
    });
  }, []);
  const setListRef = useCallback(
    (handle: InteractiveListScrollHandle | null): void => {
      listHandleRef.current = handle;
    },
    [],
  );

  const layouts = getLayouts(displayData);
  layoutsRef.current = layouts;
  const contentLength = layouts.reduce(
    (total, layout) => total + layout.length,
    0,
  );
  contentLengthRef.current = contentLength;
  const getItemKey = useCallback(
    (item: unknown, index: number) => keyExtractor(item as T, index),
    [keyExtractor],
  );
  const getItemOffset = useCallback(
    (index: number) =>
      layoutsRef.current[index]?.offset ?? index * estimatedItemSize,
    [estimatedItemSize],
  );
  const getItemTargetOffset = useCallback(
    (key: string) => offsets[key] ?? 0,
    [offsets],
  );
  const contextValue = useMemo<InteractiveListContextValue>(
    () => ({
      activeKey: activeDrag?.key,
      activeTargetOffset,
      activeTranslation,
      commitRevision,
      data: displayData,
      dragRenderDistance: activeDrag
        ? Math.max(contentLength, viewportHeightRef.current)
        : undefined,
      getItemKey,
      getItemOffset,
      getItemTargetOffset,
      horizontalGestureTolerance,
      layoutRevision,
      longPressDurationMs,
      onDragCancel: handleDragCancel,
      onDragMove: handleDragMove,
      onDragStart: handleDragStart,
      onDrop: handleDrop,
      onItemLayout: handleItemLayout,
      onRegisterSwipeable: handleRegisterSwipeable,
      onScroll: handleScroll,
      onScrollBeginDrag: handleScrollBeginDrag,
      onSwipeableClose: handleSwipeableClose,
      onSwipeableWillOpen: handleSwipeableWillOpen,
      offsets,
      scrollOffset,
      setListRef,
    }),
    [
      activeDrag,
      activeTargetOffset,
      activeTranslation,
      commitRevision,
      contentLength,
      displayData,
      getItemKey,
      getItemOffset,
      getItemTargetOffset,
      handleDragCancel,
      handleDragMove,
      handleDragStart,
      handleDrop,
      handleItemLayout,
      handleRegisterSwipeable,
      handleScroll,
      handleScrollBeginDrag,
      handleSwipeableClose,
      handleSwipeableWillOpen,
      horizontalGestureTolerance,
      layoutRevision,
      longPressDurationMs,
      offsets,
      scrollOffset,
      setListRef,
    ],
  );

  return (
    <InteractiveListContext value={contextValue}>
      <View
        onLayout={handleViewportLayout}
        ref={viewportRef}
        style={[styles.container, style]}
      >
        {children}
      </View>
    </InteractiveListContext>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
