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
  damping: 22,
  mass: 0.8,
  stiffness: 240,
} as const;
const DROP_SPRING = {
  damping: 24,
  mass: 0.85,
  stiffness: 260,
} as const;

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
    activeTargetOffset,
    activeTranslation,
    commitRevision,
    getItemKey,
    getItemOffset,
    getItemTargetOffset,
    horizontalGestureTolerance,
    layoutRevision,
    longPressDurationMs,
    onDragCancel,
    onDragMove,
    onDragStart,
    onDrop,
    onItemLayout,
    onRegisterSwipeable,
    onSwipeableClose,
    onSwipeableWillOpen,
    scrollOffset,
  } = context;
  const itemKey = getItemKey(item, index);
  const isDragging = activeKey === itemKey;
  const itemOffset = useSharedValue(getItemOffset(index));
  const itemLength = useSharedValue(0);
  const passiveTranslation = useSharedValue(0);
  const dragStartScrollOffset = useSharedValue(0);
  const activeScale = useSharedValue(1);
  const previousCommitRevision = useRef(commitRevision);
  const targetOffset = getItemTargetOffset(itemKey);

  useEffect(() => {
    itemOffset.value = getItemOffset(index);
  }, [getItemOffset, index, itemOffset, layoutRevision]);

  useLayoutEffect(() => {
    if (previousCommitRevision.current !== commitRevision) {
      previousCommitRevision.current = commitRevision;
      passiveTranslation.value = 0;
      activeScale.value = 1;
      return;
    }
    if (!isDragging) {
      passiveTranslation.value = withSpring(targetOffset, EXCHANGE_SPRING);
    }
    activeScale.value = withSpring(isDragging ? 1.02 : 1, EXCHANGE_SPRING);
  }, [
    activeScale,
    commitRevision,
    isDragging,
    passiveTranslation,
    targetOffset,
  ]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent): void => {
      const length = event.nativeEvent.layout.height;
      itemLength.value = length;
      onItemLayout(itemKey, length);
    },
    [itemKey, itemLength, onItemLayout],
  );
  const handleSwipeableRef = useCallback(
    (methods: SwipeableMethods | null): void => {
      onRegisterSwipeable(itemKey, methods);
    },
    [itemKey, onRegisterSwipeable],
  );

  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(longPressDurationMs)
        .failOffsetX([-horizontalGestureTolerance, horizontalGestureTolerance])
        .onStart(() => {
          dragStartScrollOffset.value = scrollOffset.value;
          activeTranslation.value = 0;
          scheduleOnRN(onDragStart, itemKey, index);
        })
        .onUpdate((event) => {
          const scrollDelta = scrollOffset.value - dragStartScrollOffset.value;
          const translation = event.translationY + scrollDelta;
          activeTranslation.value = translation;
          const center = itemOffset.value + itemLength.value / 2 + translation;
          scheduleOnRN(onDragMove, itemKey, center, event.absoluteY);
        })
        .onEnd(() => {
          activeTranslation.value = withSpring(
            activeTargetOffset.value,
            DROP_SPRING,
            (finished) => {
              if (finished) {
                scheduleOnRN(onDrop, itemKey);
              }
            },
          );
        })
        .onFinalize((_event, success) => {
          if (!success) {
            activeTranslation.value = withSpring(0, DROP_SPRING, () =>
              scheduleOnRN(onDragCancel, itemKey),
            );
          }
        }),
    [
      activeTargetOffset,
      activeTranslation,
      dragStartScrollOffset,
      horizontalGestureTolerance,
      index,
      itemKey,
      itemLength,
      itemOffset,
      longPressDurationMs,
      onDragCancel,
      onDragMove,
      onDragStart,
      onDrop,
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
