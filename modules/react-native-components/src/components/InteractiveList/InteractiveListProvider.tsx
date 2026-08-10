import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  View,
} from 'react-native';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { createLogger, type LogFields } from 'react-native-logger';
import {
  cancelAnimation,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  buildItemLayouts,
  findReorderTargetWithHysteresis,
  getAutoScrollSpeed,
  getExchangeAnimationIndex,
  getReorderOffsets,
  haveSameKeyOrder,
  type InteractiveListItemLayout,
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
const EXCHANGE_HYSTERESIS = 8;
const ITEM_SIZE_EPSILON = 0.5;
const DROP_SPRING = {
  damping: 24,
  mass: 0.85,
  overshootClamping: true,
  stiffness: 260,
} as const;

type DragPhase = 'dragging' | 'settling';

interface ActiveDrag {
  index: number;
  key: string;
  keys: string[];
  layouts: InteractiveListItemLayout[];
  phase: DragPhase;
  sessionId: number;
  targetIndex: number;
}

interface PendingCommit<T> {
  fromIndex: number;
  key: string;
  nextData: T[];
  sessionId: number;
  toIndex: number;
}

export function InteractiveListProvider<T>({
  autoScrollEdgeSize = DEFAULT_EDGE_SIZE,
  autoScrollMaxSpeed = DEFAULT_MAX_AUTO_SCROLL_SPEED,
  children,
  data,
  debug = false,
  estimatedItemSize = DEFAULT_ESTIMATED_ITEM_SIZE,
  horizontalGestureTolerance = DEFAULT_HORIZONTAL_TOLERANCE,
  keyExtractor,
  longPressDurationMs = DEFAULT_LONG_PRESS_DURATION,
  onReorder,
  style,
}: InteractiveListProviderProps<T>): React.JSX.Element {
  const [displayData, setDisplayData] = useState<T[]>(() => [...data]);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [animatedOffsetKey, setAnimatedOffsetKey] = useState<string>();
  const [commitRevision, setCommitRevision] = useState(0);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [offsets, setOffsets] = useState<Record<string, number>>({});
  const dataRef = useRef(displayData);
  const activeDragRef = useRef<ActiveDrag | null>(null);
  const dragSessionRef = useRef(0);
  const measuredLengthsRef = useRef(new Map<string, number>());
  const pendingLayoutRevisionRef = useRef(false);
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
  const commitFrameRef = useRef<number | null>(null);
  const pendingCommitRef = useRef<PendingCommit<T> | null>(null);
  const scrollOffset = useSharedValue(0);
  const activeTranslation = useSharedValue(0);
  const activeTargetOffset = useSharedValue(0);
  const logger = useMemo(
    () => createLogger('InteractiveList', { enabled: debug }),
    [debug],
  );
  const logEvent = useCallback(
    (
      level: 'debug' | 'info' | 'warn' | 'error',
      event: string,
      fields?: LogFields,
    ): void => {
      const session = activeDragRef.current?.sessionId ?? 'none';
      logger[level](event, { session, ...fields });
    },
    [logger],
  );

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

  const closeOpenRow = useCallback((): void => {
    const openKey = openKeyRef.current;
    if (openKey !== null) {
      logEvent('debug', 'swipe.close_open_row', { key: openKey });
      swipeableRefs.current.get(openKey)?.close();
      openKeyRef.current = null;
    }
  }, [logEvent]);

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
    const wasRunning =
      autoScrollSpeedRef.current !== 0 || autoScrollFrameRef.current !== null;
    if (wasRunning) {
      logEvent('info', 'auto_scroll.stop', {
        offset: scrollOffsetRef.current,
        speed: autoScrollSpeedRef.current,
      });
    }
    autoScrollSpeedRef.current = 0;
    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  }, [logEvent]);

  const updateTarget = useCallback(
    (key: string, activeCenter: number): void => {
      const active = activeDragRef.current;
      if (!active || active.key !== key || active.phase !== 'dragging') {
        return;
      }
      const targetIndex = findReorderTargetWithHysteresis(
        active.layouts,
        active.index,
        active.targetIndex,
        activeCenter,
        EXCHANGE_HYSTERESIS,
      );
      if (targetIndex === active.targetIndex) {
        return;
      }
      const nextActive = { ...active, targetIndex };
      activeDragRef.current = nextActive;
      setActiveDrag(nextActive);
      const calculatedOffsets = getReorderOffsets(
        active.layouts,
        active.index,
        targetIndex,
      );
      const nextOffsets: Record<string, number> = {};
      active.keys.forEach((itemKey, index) => {
        nextOffsets[itemKey] = calculatedOffsets[index];
      });
      activeTargetOffset.value = calculatedOffsets[active.index] ?? 0;
      const animatedIndex = getExchangeAnimationIndex(
        active.index,
        active.targetIndex,
        targetIndex,
      );
      setAnimatedOffsetKey(
        animatedIndex === undefined ? undefined : active.keys[animatedIndex],
      );
      logEvent('info', 'target.change', {
        animatedKey:
          animatedIndex === undefined ? null : active.keys[animatedIndex],
        center: activeCenter,
        from: active.targetIndex,
        key,
        targetOffset: activeTargetOffset.value,
        to: targetIndex,
      });
      setOffsets(nextOffsets);
    },
    [activeTargetOffset, logEvent],
  );

  const runAutoScroll = useCallback((): void => {
    autoScrollFrameRef.current = requestAnimationFrame(() => {
      const speed = autoScrollSpeedRef.current;
      const active = activeDragRef.current;
      if (speed === 0 || !active || active.phase !== 'dragging') {
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
        const activeLayout = active.layouts[active.index];
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
  }, [activeTranslation, scrollOffset, updateTarget]);

  useEffect(
    () => () => {
      logEvent('info', 'provider.unmount');
      stopAutoScroll();
      cancelAnimation(activeTranslation);
      if (commitFrameRef.current !== null) {
        cancelAnimationFrame(commitFrameRef.current);
        commitFrameRef.current = null;
      }
      pendingCommitRef.current = null;
    },
    [activeTranslation, logEvent, stopAutoScroll],
  );

  const handleDragStart = useCallback(
    (key: string, index: number): void => {
      logEvent('info', 'drag.start_request', { index, key });
      const items = dataRef.current;
      const keys = getKeys(items);
      if (keys[index] !== key) {
        logEvent('warn', 'drag.start_rejected', {
          actualKey: keys[index] ?? null,
          index,
          key,
          reason: 'key_mismatch',
        });
        return;
      }
      closeOpenRow();
      stopAutoScroll();
      cancelAnimation(activeTranslation);
      listHandleRef.current?.prepareForLayoutAnimationRender?.();
      const layouts = getLayouts(items);
      const nextActive: ActiveDrag = {
        index,
        key,
        keys,
        layouts,
        phase: 'dragging',
        sessionId: dragSessionRef.current + 1,
        targetIndex: index,
      };
      dragSessionRef.current = nextActive.sessionId;
      activeDragRef.current = nextActive;
      contentLengthRef.current = layouts.reduce(
        (total, layout) => total + layout.length,
        0,
      );
      activeTargetOffset.value = 0;
      activeTranslation.value = 0;
      setAnimatedOffsetKey(undefined);
      setOffsets({});
      setActiveDrag(nextActive);
      logEvent('info', 'drag.started', {
        contentLength: contentLengthRef.current,
        index,
        itemLength: layouts[index]?.length ?? null,
        key,
        layoutCount: layouts.length,
      });
    },
    [
      activeTargetOffset,
      activeTranslation,
      closeOpenRow,
      getKeys,
      getLayouts,
      logEvent,
      stopAutoScroll,
    ],
  );

  const handleDragMove = useCallback(
    (key: string, center: number, absoluteY: number): void => {
      const active = activeDragRef.current;
      if (!active || active.key !== key || active.phase !== 'dragging') {
        return;
      }
      updateTarget(key, center);
      const bounds = viewportBoundsRef.current;
      const speed = getAutoScrollSpeed({
        edgeSize: autoScrollEdgeSize,
        maxSpeed: autoScrollMaxSpeed,
        pointerY: absoluteY,
        viewportEnd: bounds.end,
        viewportStart: bounds.start,
      });
      const previousSpeed = autoScrollSpeedRef.current;
      autoScrollSpeedRef.current = speed;
      if (speed !== 0 && autoScrollFrameRef.current === null) {
        logEvent('info', 'auto_scroll.start', {
          absoluteY,
          direction: speed > 0 ? 'down' : 'up',
          speed,
        });
        runAutoScroll();
      } else if (speed === 0 && autoScrollFrameRef.current !== null) {
        stopAutoScroll();
      } else if (
        speed !== 0 &&
        previousSpeed !== 0 &&
        Math.sign(speed) !== Math.sign(previousSpeed)
      ) {
        logEvent('info', 'auto_scroll.direction_change', {
          absoluteY,
          speed,
        });
      }
    },
    [
      autoScrollEdgeSize,
      autoScrollMaxSpeed,
      logEvent,
      runAutoScroll,
      stopAutoScroll,
      updateTarget,
    ],
  );

  const resetDrag = useCallback((): void => {
    const active = activeDragRef.current;
    logEvent('info', 'drag.reset', {
      key: active?.key ?? null,
      phase: active?.phase ?? 'idle',
      targetIndex: active?.targetIndex ?? null,
    });
    stopAutoScroll();
    cancelAnimation(activeTranslation);
    if (commitFrameRef.current !== null) {
      cancelAnimationFrame(commitFrameRef.current);
      commitFrameRef.current = null;
    }
    pendingCommitRef.current = null;
    activeDragRef.current = null;
    activeTargetOffset.value = 0;
    activeTranslation.value = 0;
    setAnimatedOffsetKey(undefined);
    setOffsets({});
    setActiveDrag(null);
    if (pendingLayoutRevisionRef.current) {
      pendingLayoutRevisionRef.current = false;
      setLayoutRevision((current) => current + 1);
    }
  }, [activeTargetOffset, activeTranslation, logEvent, stopAutoScroll]);

  const handleItemCommitLayout = useCallback(
    (key: string): void => {
      logEvent('debug', 'commit.layout_callback', { key });
      const pendingCommit = pendingCommitRef.current;
      const active = activeDragRef.current;
      if (
        !pendingCommit ||
        !active ||
        pendingCommit.key !== key ||
        pendingCommit.sessionId !== active.sessionId ||
        active.phase !== 'settling'
      ) {
        logEvent('debug', 'commit.layout_ignored', { key });
        return;
      }

      const { fromIndex, nextData, toIndex } = pendingCommit;
      // 新 key 已经进入目标槽位，此时清理 transform 不会暴露 FlashList 的复用中间态。
      logEvent('info', 'commit.complete', {
        fromIndex,
        key,
        toIndex,
      });
      resetDrag();
      onReorder(nextData, fromIndex, toIndex);
    },
    [logEvent, onReorder, resetDrag],
  );

  const handleSettleComplete = useCallback(
    (key: string, sessionId: number, finished: boolean): void => {
      logEvent('debug', 'settle.callback', { finished, key, sessionId });
      const active = activeDragRef.current;
      if (
        !active ||
        active.key !== key ||
        active.sessionId !== sessionId ||
        active.phase !== 'settling'
      ) {
        logEvent('debug', 'settle.callback_ignored', {
          finished,
          key,
          sessionId,
        });
        return;
      }
      if (!finished) {
        logEvent('warn', 'settle.interrupted', { key });
        resetDrag();
        return;
      }
      const { index, targetIndex } = active;
      if (index === targetIndex) {
        logEvent('info', 'settle.no_change', { index, key });
        resetDrag();
        return;
      }
      const nextData = reorderItems(dataRef.current, index, targetIndex);
      listHandleRef.current?.prepareForLayoutAnimationRender?.();
      pendingCommitRef.current = {
        fromIndex: index,
        key,
        nextData,
        sessionId,
        toIndex: targetIndex,
      };
      dataRef.current = nextData;
      setCommitRevision((current) => current + 1);
      setDisplayData(nextData);
      logEvent('info', 'commit.prepared', {
        fromIndex: index,
        key,
        toIndex: targetIndex,
      });
      commitFrameRef.current = requestAnimationFrame(() => {
        commitFrameRef.current = null;
        logEvent('debug', 'commit.raf_fallback', { key });
        handleItemCommitLayout(key);
      });
    },
    [handleItemCommitLayout, logEvent, resetDrag],
  );

  const handleDragRelease = useCallback(
    (key: string): void => {
      logEvent('info', 'drag.release_request', { key });
      const active = activeDragRef.current;
      if (!active || active.key !== key || active.phase !== 'dragging') {
        logEvent('debug', 'drag.release_ignored', { key });
        return;
      }
      stopAutoScroll();
      const settlingDrag: ActiveDrag = { ...active, phase: 'settling' };
      activeDragRef.current = settlingDrag;
      setActiveDrag(settlingDrag);
      logEvent('info', 'settle.started', {
        key,
        targetIndex: active.targetIndex,
        targetOffset: activeTargetOffset.value,
        translation: activeTranslation.value,
      });
      activeTranslation.value = withSpring(
        activeTargetOffset.value,
        DROP_SPRING,
        (finished) => {
          scheduleOnRN(
            handleSettleComplete,
            key,
            active.sessionId,
            finished === true,
          );
        },
      );
    },
    [
      activeTargetOffset,
      activeTranslation,
      handleSettleComplete,
      logEvent,
      stopAutoScroll,
    ],
  );

  const handleCancelComplete = useCallback(
    (key: string, sessionId: number): void => {
      logEvent('debug', 'cancel.callback', { key, sessionId });
      const active = activeDragRef.current;
      if (active?.key === key && active.sessionId === sessionId) {
        logEvent('info', 'cancel.complete', { key });
        resetDrag();
      }
    },
    [logEvent, resetDrag],
  );

  const handleDragCancel = useCallback(
    (key: string): void => {
      logEvent('info', 'drag.cancel_request', { key });
      const active = activeDragRef.current;
      if (!active || active.key !== key || active.phase !== 'dragging') {
        logEvent('debug', 'drag.cancel_ignored', { key });
        return;
      }
      stopAutoScroll();
      const settlingDrag: ActiveDrag = { ...active, phase: 'settling' };
      activeDragRef.current = settlingDrag;
      setActiveDrag(settlingDrag);
      activeTargetOffset.value = 0;
      logEvent('info', 'cancel.settle_started', {
        key,
        translation: activeTranslation.value,
      });
      activeTranslation.value = withSpring(0, DROP_SPRING, () => {
        scheduleOnRN(handleCancelComplete, key, active.sessionId);
      });
    },
    [
      activeTargetOffset,
      activeTranslation,
      handleCancelComplete,
      logEvent,
      stopAutoScroll,
    ],
  );

  useEffect(() => {
    const nextData = [...data];
    const nextKeys = getKeys(nextData);
    const active = activeDragRef.current;
    if (active && !haveSameKeyOrder(active.keys, nextKeys)) {
      logEvent('warn', 'data.external_order_change', {
        currentCount: active.keys.length,
        nextCount: nextKeys.length,
      });
      resetDrag();
    } else if (active) {
      logEvent('debug', 'data.external_content_sync', {
        count: nextKeys.length,
      });
    }
    dataRef.current = nextData;
    setDisplayData(nextData);
  }, [data, getKeys, logEvent, resetDrag]);

  const handleItemLayout = useCallback(
    (key: string, length: number): void => {
      const previousLength = measuredLengthsRef.current.get(key);
      if (
        previousLength === undefined ||
        Math.abs(previousLength - length) > ITEM_SIZE_EPSILON
      ) {
        measuredLengthsRef.current.set(key, length);
        logEvent('debug', 'item.measure', {
          key,
          length,
          previousLength: previousLength ?? null,
        });
        if (activeDragRef.current) {
          pendingLayoutRevisionRef.current = true;
        } else {
          setLayoutRevision((current) => current + 1);
        }
      }
    },
    [logEvent],
  );
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
  const handleSwipeableWillOpen = useCallback(
    (key: string): void => {
      logEvent('info', 'swipe.will_open', { key });
      const previousKey = openKeyRef.current;
      if (previousKey !== null && previousKey !== key) {
        swipeableRefs.current.get(previousKey)?.close();
      }
      openKeyRef.current = key;
    },
    [logEvent],
  );
  const handleSwipeableClose = useCallback(
    (key: string): void => {
      logEvent('info', 'swipe.closed', { key });
      if (openKeyRef.current === key) {
        openKeyRef.current = null;
      }
    },
    [logEvent],
  );
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

  const measuredLayouts = useMemo(() => {
    // 测量修订号让 ref 中的尺寸变化参与布局缓存失效。
    void layoutRevision;
    return getLayouts(displayData);
  }, [displayData, getLayouts, layoutRevision]);
  const interactionLayouts = activeDrag?.layouts ?? measuredLayouts;
  const contentLength = interactionLayouts.reduce(
    (total, layout) => total + layout.length,
    0,
  );
  const getItemKey = useCallback(
    (item: unknown, index: number) => keyExtractor(item as T, index),
    [keyExtractor],
  );
  const getItemLength = useCallback(
    (index: number) => measuredLayouts[index]?.length ?? estimatedItemSize,
    [estimatedItemSize, measuredLayouts],
  );
  const getItemOffset = useCallback(
    (index: number) =>
      measuredLayouts[index]?.offset ?? index * estimatedItemSize,
    [estimatedItemSize, measuredLayouts],
  );
  const getItemTargetOffset = useCallback(
    (key: string) => offsets[key] ?? 0,
    [offsets],
  );
  const contextValue = useMemo<InteractiveListContextValue>(
    () => ({
      activeKey: activeDrag?.key,
      activeTranslation,
      animatedOffsetKey,
      commitRevision,
      data: displayData,
      debugEnabled: debug,
      dragRenderDistance: activeDrag
        ? Math.max(contentLength, viewportHeightRef.current)
        : undefined,
      getItemKey,
      getItemLength,
      getItemOffset,
      getItemTargetOffset,
      horizontalGestureTolerance,
      layoutRevision,
      longPressDurationMs,
      onDragCancel: handleDragCancel,
      onDragMove: handleDragMove,
      onDragRelease: handleDragRelease,
      onDragStart: handleDragStart,
      onDebugEvent: logEvent,
      onItemCommitLayout: handleItemCommitLayout,
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
      activeTranslation,
      animatedOffsetKey,
      commitRevision,
      contentLength,
      debug,
      displayData,
      getItemKey,
      getItemLength,
      getItemOffset,
      getItemTargetOffset,
      handleDragCancel,
      handleDragMove,
      handleDragRelease,
      handleDragStart,
      handleItemCommitLayout,
      handleItemLayout,
      handleRegisterSwipeable,
      handleScroll,
      handleScrollBeginDrag,
      handleSwipeableClose,
      handleSwipeableWillOpen,
      horizontalGestureTolerance,
      layoutRevision,
      logEvent,
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
