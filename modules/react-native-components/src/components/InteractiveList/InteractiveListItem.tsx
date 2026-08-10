import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  cancelAnimation,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useInteractiveListContext } from '../../react/interactive-list-context';
import type {
  InteractiveListActionInfo,
  InteractiveListItemProps,
} from './types';

const EXCHANGE_SPRING = {
  damping: 34,
  mass: 0.8,
  overshootClamping: true,
  stiffness: 360,
} as const;
const EXCHANGE_CATCH_UP_SPRING = {
  damping: 44,
  mass: 0.6,
  overshootClamping: true,
  stiffness: 800,
} as const;
const DEBUG_MOVE_SAMPLE_DISTANCE = 32;

export function InteractiveListItem<T>({
  children,
  index,
  item,
  renderLeftActions,
  renderRightActions,
}: InteractiveListItemProps<T>): React.JSX.Element {
  const context = useInteractiveListContext();
  const {
    activeKey,
    activeTranslation,
    animatedOffsetKey,
    commitRevision,
    debugEnabled,
    getItemKey,
    getItemLength,
    getItemOffset,
    getItemTargetOffset,
    horizontalGestureTolerance,
    layoutRevision,
    longPressDurationMs,
    onDragCancel,
    onDragMove,
    onDragRelease,
    onDragStart,
    onDebugEvent,
    onItemCommitLayout,
    onItemLayout,
    onRegisterSwipeable,
    onSwipeableClose,
    onSwipeableWillOpen,
    scrollOffset,
  } = context;
  const itemKey = getItemKey(item, index);
  const isDragging = activeKey === itemKey;
  const itemOffset = useSharedValue(getItemOffset(index));
  const itemLength = useSharedValue(getItemLength(index));
  const passiveTranslation = useSharedValue(0);
  const dragStartScrollOffset = useSharedValue(0);
  const activeScale = useSharedValue(1);
  const debugLastTranslation = useSharedValue(0);
  const previousCommitRevision = useRef(commitRevision);
  const previousItemKey = useRef(itemKey);
  const wasAnimatedOffset = useRef(false);
  const swipeableRef = useRef<SwipeableMethods | null>(null);
  const targetOffset = getItemTargetOffset(itemKey);

  useEffect(() => {
    itemOffset.value = getItemOffset(index);
  }, [getItemOffset, index, itemOffset, layoutRevision]);

  useLayoutEffect(() => {
    if (previousCommitRevision.current !== commitRevision) {
      previousCommitRevision.current = commitRevision;
      cancelAnimation(passiveTranslation);
      passiveTranslation.value = 0;
      activeScale.value = 1;
      wasAnimatedOffset.current = false;
      if (isDragging) {
        if (debugEnabled) {
          onDebugEvent('info', 'item.commit_layout', { index, key: itemKey });
        }
        // 先让活动项采用新槽位的原点，再通知 Provider 清理拖拽态，避免复用帧回跳。
        activeTranslation.value = 0;
        onItemCommitLayout(itemKey);
      }
      return;
    }
    if (!isDragging) {
      const shouldAnimateOffset = animatedOffsetKey === itemKey;
      cancelAnimation(passiveTranslation);
      if (shouldAnimateOffset) {
        if (debugEnabled) {
          onDebugEvent('debug', 'exchange.started', {
            index,
            key: itemKey,
            targetOffset,
          });
        }
        passiveTranslation.value = withSpring(targetOffset, EXCHANGE_SPRING);
      } else if (wasAnimatedOffset.current) {
        if (debugEnabled) {
          onDebugEvent('debug', 'exchange.catch_up', {
            index,
            key: itemKey,
            targetOffset,
          });
        }
        // 新边界接管时让上一项快速收敛，避免直接吸附产生可见顿挫。
        passiveTranslation.value = withSpring(
          targetOffset,
          EXCHANGE_CATCH_UP_SPRING,
        );
      } else {
        passiveTranslation.value = targetOffset;
      }
      wasAnimatedOffset.current = shouldAnimateOffset;
    }
    activeScale.value = withSpring(isDragging ? 1.02 : 1, EXCHANGE_SPRING);
  }, [
    activeScale,
    activeTranslation,
    animatedOffsetKey,
    commitRevision,
    debugEnabled,
    index,
    isDragging,
    itemKey,
    onItemCommitLayout,
    onDebugEvent,
    passiveTranslation,
    targetOffset,
  ]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent): void => {
      const length = event.nativeEvent.layout.height;
      if (!isDragging) {
        itemLength.value = length;
      }
      onItemLayout(itemKey, length);
    },
    [isDragging, itemKey, itemLength, onItemLayout],
  );
  const handleSwipeableRef = useCallback(
    (methods: SwipeableMethods | null): void => {
      swipeableRef.current = methods;
      onRegisterSwipeable(itemKey, methods);
    },
    [itemKey, onRegisterSwipeable],
  );

  useLayoutEffect(() => {
    const previousKey = previousItemKey.current;
    if (previousKey === itemKey) {
      return;
    }

    // FlashList 会复用行实例，新项目不应继承旧项目的交互状态。
    if (debugEnabled) {
      onDebugEvent('debug', 'item.recycled', {
        fromKey: previousKey,
        index,
        toKey: itemKey,
      });
    }
    swipeableRef.current?.close();
    onRegisterSwipeable(previousKey, null);
    cancelAnimation(passiveTranslation);
    cancelAnimation(activeScale);
    passiveTranslation.value = 0;
    activeScale.value = 1;
    wasAnimatedOffset.current = false;
    dragStartScrollOffset.value = scrollOffset.value;
    itemOffset.value = getItemOffset(index);
    itemLength.value = getItemLength(index);
    previousCommitRevision.current = commitRevision;
    previousItemKey.current = itemKey;
  }, [
    activeScale,
    commitRevision,
    debugEnabled,
    dragStartScrollOffset,
    getItemLength,
    getItemOffset,
    index,
    itemKey,
    itemLength,
    itemOffset,
    onRegisterSwipeable,
    onDebugEvent,
    passiveTranslation,
    scrollOffset,
  ]);

  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(longPressDurationMs)
        .failOffsetX([-horizontalGestureTolerance, horizontalGestureTolerance])
        .onBegin(() => {
          if (debugEnabled) {
            scheduleOnRN(onDebugEvent, 'debug', 'gesture.begin', {
              index,
              key: itemKey,
            });
          }
        })
        .onStart(() => {
          dragStartScrollOffset.value = scrollOffset.value;
          activeTranslation.value = 0;
          debugLastTranslation.value = 0;
          if (debugEnabled) {
            scheduleOnRN(onDebugEvent, 'info', 'gesture.activated', {
              index,
              key: itemKey,
              scrollOffset: scrollOffset.value,
            });
          }
          scheduleOnRN(onDragStart, itemKey, index);
        })
        .onUpdate((event) => {
          const scrollDelta = scrollOffset.value - dragStartScrollOffset.value;
          const translation = event.translationY + scrollDelta;
          activeTranslation.value = translation;
          const center = itemOffset.value + itemLength.value / 2 + translation;
          if (
            debugEnabled &&
            Math.abs(translation - debugLastTranslation.value) >=
              DEBUG_MOVE_SAMPLE_DISTANCE
          ) {
            debugLastTranslation.value = translation;
            scheduleOnRN(onDebugEvent, 'debug', 'gesture.move', {
              absoluteY: event.absoluteY,
              center,
              index,
              key: itemKey,
              translation,
            });
          }
          scheduleOnRN(onDragMove, itemKey, center, event.absoluteY);
        })
        .onEnd(() => {
          if (debugEnabled) {
            scheduleOnRN(onDebugEvent, 'info', 'gesture.end', {
              index,
              key: itemKey,
              translation: activeTranslation.value,
            });
          }
          scheduleOnRN(onDragRelease, itemKey);
        })
        .onFinalize((_event, success) => {
          if (debugEnabled) {
            scheduleOnRN(onDebugEvent, 'info', 'gesture.finalize', {
              index,
              key: itemKey,
              success,
            });
          }
          if (!success) {
            scheduleOnRN(onDragCancel, itemKey);
          }
        }),
    [
      activeTranslation,
      debugEnabled,
      debugLastTranslation,
      dragStartScrollOffset,
      horizontalGestureTolerance,
      index,
      itemKey,
      itemLength,
      itemOffset,
      longPressDurationMs,
      onDragCancel,
      onDragMove,
      onDragRelease,
      onDragStart,
      onDebugEvent,
      scrollOffset,
    ],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: isDragging
          ? activeTranslation.value
          : passiveTranslation.value,
      },
      { scale: activeScale.value },
    ],
    zIndex: isDragging ? 10 : 0,
  }));
  const leftActions = useCallback(
    (
      progress: SharedValue<number>,
      translation: SharedValue<number>,
      methods: SwipeableMethods,
    ) =>
      renderLeftActions?.({
        close: methods.close,
        item,
        progress,
        translation,
      } satisfies InteractiveListActionInfo<T>),
    [item, renderLeftActions],
  );
  const rightActions = useCallback(
    (
      progress: SharedValue<number>,
      translation: SharedValue<number>,
      methods: SwipeableMethods,
    ) =>
      renderRightActions?.({
        close: methods.close,
        item,
        progress,
        translation,
      } satisfies InteractiveListActionInfo<T>),
    [item, renderRightActions],
  );

  return (
    <GestureDetector gesture={dragGesture}>
      <Animated.View onLayout={handleLayout} style={animatedStyle}>
        <ReanimatedSwipeable
          enabled={activeKey === undefined}
          onSwipeableClose={() => onSwipeableClose(itemKey)}
          onSwipeableWillOpen={() => onSwipeableWillOpen(itemKey)}
          overshootLeft={false}
          overshootRight={false}
          ref={handleSwipeableRef}
          renderLeftActions={renderLeftActions ? leftActions : undefined}
          renderRightActions={renderRightActions ? rightActions : undefined}
          simultaneousWithExternalGesture={dragGesture}
        >
          {typeof children === 'function'
            ? children({ index, isDragging, item })
            : children}
        </ReanimatedSwipeable>
      </Animated.View>
    </GestureDetector>
  );
}
