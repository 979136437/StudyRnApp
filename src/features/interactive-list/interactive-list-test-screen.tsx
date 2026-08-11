import { Color, Stack } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type ColorValue,
} from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import {
  Sortable,
  SortableItem,
  type SortableRenderItemProps,
} from 'react-native-reanimated-dnd';

const ITEM_HEIGHT = 84;
const ACTION_WIDTH = 88;
const SWIPE_THRESHOLD = ACTION_WIDTH / 2;

const COLORS = {
  accent: Platform.select<ColorValue>({
    android: Color.android.dynamic.primary,
    default: '#1769aa',
    ios: Color.ios.systemBlue,
  }),
  background: Platform.select<ColorValue>({
    android: Color.android.dynamic.surface,
    default: '#f4f5f7',
    ios: Color.ios.systemGroupedBackground,
  }),
  border: Platform.select<ColorValue>({
    android: Color.android.dynamic.outlineVariant,
    default: '#d7d9dd',
    ios: Color.ios.separator,
  }),
  muted: Platform.select<ColorValue>({
    android: Color.android.dynamic.onSurfaceVariant,
    default: '#5f6368',
    ios: Color.ios.secondaryLabel,
  }),
  surface: Platform.select<ColorValue>({
    android: Color.android.dynamic.surfaceContainer,
    default: '#ffffff',
    ios: Color.ios.secondarySystemGroupedBackground,
  }),
  text: Platform.select<ColorValue>({
    android: Color.android.dynamic.onSurface,
    default: '#202124',
    ios: Color.ios.label,
  }),
};

const ACTION_COLORS = {
  delete: '#c62828',
  pin: '#1769aa',
};

interface TestItem {
  description: string;
  id: string;
  title: string;
}

const INITIAL_ITEMS: TestItem[] = Array.from({ length: 18 }, (_, index) => ({
  description:
    index % 2 === 0
      ? '右滑置顶，左滑删除，按住行尾手柄拖拽排序。'
      : '固定高度项目，用于验证滑动与纵向拖拽的手势边界。',
  id: `interactive-item-${index + 1}`,
  title: `项目 ${String(index + 1).padStart(2, '0')}`,
}));

const ITEM_TITLE_BY_ID = new Map(
  INITIAL_ITEMS.map((item) => [item.id, item.title]),
);

function getItemTitle(id: string): string {
  return ITEM_TITLE_BY_ID.get(id) ?? id;
}

function reorderByPositions(
  items: TestItem[],
  positions: Record<string, number> | undefined,
  movedId: string,
  targetIndex: number,
): TestItem[] {
  if (items.length < 2) {
    return items;
  }

  if (positions !== undefined) {
    const ordered = items
      .map((item) => ({ item, position: positions[item.id] }))
      .filter(
        (entry): entry is { item: TestItem; position: number } =>
          Number.isInteger(entry.position) &&
          entry.position >= 0 &&
          entry.position < items.length,
      )
      .sort((left, right) => left.position - right.position);
    const uniquePositions = new Set(ordered.map((entry) => entry.position));

    if (
      ordered.length === items.length &&
      uniquePositions.size === items.length
    ) {
      return ordered.map((entry) => entry.item);
    }
  }

  const sourceIndex = items.findIndex((item) => item.id === movedId);
  if (sourceIndex < 0 || !Number.isInteger(targetIndex)) {
    return items;
  }

  const boundedTargetIndex = Math.min(
    Math.max(targetIndex, 0),
    items.length - 1,
  );
  if (sourceIndex === boundedTargetIndex) {
    return items;
  }

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(sourceIndex, 1);
  if (movedItem === undefined) {
    return items;
  }
  nextItems.splice(boundedTargetIndex, 0, movedItem);
  return nextItems;
}

interface SwipeActionProps {
  backgroundColor: string;
  label: string;
  onPress: () => void;
  progress: SharedValue<number>;
}

function SwipeAction({
  backgroundColor,
  label,
  onPress,
  progress,
}: SwipeActionProps): React.JSX.Element {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.4, 1], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(
          progress.value,
          [0, 1],
          [0.84, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <Animated.View style={[styles.action, { backgroundColor }, animatedStyle]}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.actionButton,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.actionText}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

interface InteractiveRowProps {
  onDelete: (id: string) => void;
  onDragStart: (id: string) => void;
  onDrop: (
    id: string,
    position: number,
    positions?: Record<string, number>,
  ) => void;
  onPin: (id: string) => void;
  onSwipeableClose: (methods: SwipeableMethods) => void;
  onSwipeableWillOpen: (methods: SwipeableMethods) => void;
  sortable: SortableRenderItemProps<TestItem>;
}

function InteractiveRow({
  onDelete,
  onDragStart,
  onDrop,
  onPin,
  onSwipeableClose,
  onSwipeableWillOpen,
  sortable,
}: InteractiveRowProps): React.JSX.Element {
  const swipeableRef = useRef<SwipeableMethods>(null);
  const { id, index, item, ...sortableItemProps } = sortable;

  const handleSwipeableWillOpen = useCallback((): void => {
    if (swipeableRef.current !== null) {
      onSwipeableWillOpen(swipeableRef.current);
    }
  }, [onSwipeableWillOpen]);

  const handleSwipeableClose = useCallback((): void => {
    if (swipeableRef.current !== null) {
      onSwipeableClose(swipeableRef.current);
    }
  }, [onSwipeableClose]);

  const renderLeftActions = useCallback(
    (
      progress: SharedValue<number>,
      _translation: SharedValue<number>,
      methods: SwipeableMethods,
    ) => (
      <SwipeAction
        backgroundColor={ACTION_COLORS.pin}
        label="置顶"
        onPress={() => {
          methods.close();
          onPin(id);
        }}
        progress={progress}
      />
    ),
    [id, onPin],
  );

  const renderRightActions = useCallback(
    (
      progress: SharedValue<number>,
      _translation: SharedValue<number>,
      methods: SwipeableMethods,
    ) => (
      <SwipeAction
        backgroundColor={ACTION_COLORS.delete}
        label="删除"
        onPress={() => {
          methods.close();
          onDelete(id);
        }}
        progress={progress}
      />
    ),
    [id, onDelete],
  );

  return (
    <SortableItem<TestItem>
      {...sortableItemProps}
      data={item}
      id={id}
      onDragStart={onDragStart}
      onDrop={onDrop}
    >
      <ReanimatedSwipeable
        childrenContainerStyle={styles.swipeableChildren}
        containerStyle={styles.swipeable}
        enableTrackpadTwoFingerGesture
        friction={1.8}
        leftThreshold={SWIPE_THRESHOLD}
        onSwipeableClose={handleSwipeableClose}
        onSwipeableWillOpen={handleSwipeableWillOpen}
        overshootFriction={8}
        overshootLeft={false}
        overshootRight={false}
        ref={swipeableRef}
        renderLeftActions={renderLeftActions}
        renderRightActions={renderRightActions}
        rightThreshold={SWIPE_THRESHOLD}
        testID={`interactive-row-${id}`}
      >
        <View style={styles.row}>
          <View style={styles.orderBadge}>
            <Text selectable style={styles.orderText}>
              {index + 1}
            </Text>
          </View>
          <View style={styles.rowCopy}>
            <Text selectable numberOfLines={1} style={styles.rowTitle}>
              {item.title}
            </Text>
            <Text selectable numberOfLines={2} style={styles.rowDescription}>
              {item.description}
            </Text>
          </View>
          <SortableItem.Handle style={styles.dragHandle}>
            <View
              accessibilityHint="长按后上下拖动以调整顺序"
              accessibilityLabel={`拖拽排序 ${item.title}`}
              accessibilityRole="adjustable"
              accessible
              style={styles.dragHandleIcon}
            >
              <View style={styles.dragHandleBar} />
              <View style={styles.dragHandleBar} />
              <View style={styles.dragHandleBar} />
            </View>
          </SortableItem.Handle>
        </View>
      </ReanimatedSwipeable>
    </SortableItem>
  );
}

export function InteractiveListTestScreen(): React.JSX.Element {
  useColorScheme();
  const [items, setItems] = useState(INITIAL_ITEMS);
  const [lastAction, setLastAction] = useState('等待操作');
  const openSwipeableRef = useRef<SwipeableMethods | null>(null);

  const closeOpenSwipeable = useCallback((): void => {
    openSwipeableRef.current?.close();
    openSwipeableRef.current = null;
  }, []);

  const handleSwipeableWillOpen = useCallback(
    (methods: SwipeableMethods): void => {
      if (
        openSwipeableRef.current !== null &&
        openSwipeableRef.current !== methods
      ) {
        openSwipeableRef.current.close();
      }
      openSwipeableRef.current = methods;
    },
    [],
  );

  const handleSwipeableClose = useCallback(
    (methods: SwipeableMethods): void => {
      if (openSwipeableRef.current === methods) {
        openSwipeableRef.current = null;
      }
    },
    [],
  );

  const handlePin = useCallback(
    (id: string): void => {
      closeOpenSwipeable();
      setItems((current) => {
        const sourceIndex = current.findIndex((item) => item.id === id);
        if (sourceIndex <= 0) {
          return current;
        }
        const nextItems = [...current];
        const [selectedItem] = nextItems.splice(sourceIndex, 1);
        if (selectedItem === undefined) {
          return current;
        }
        nextItems.unshift(selectedItem);
        return nextItems;
      });
      setLastAction(`${getItemTitle(id)} 已置顶`);
    },
    [closeOpenSwipeable],
  );

  const handleDelete = useCallback(
    (id: string): void => {
      closeOpenSwipeable();
      setItems((current) => current.filter((item) => item.id !== id));
      setLastAction(`${getItemTitle(id)} 已删除`);
    },
    [closeOpenSwipeable],
  );

  const handleDragStart = useCallback(
    (id: string): void => {
      closeOpenSwipeable();
      setLastAction(`正在拖拽 ${getItemTitle(id)}`);
    },
    [closeOpenSwipeable],
  );

  const handleDrop = useCallback(
    (
      id: string,
      position: number,
      positions?: Record<string, number>,
    ): void => {
      setItems((current) =>
        reorderByPositions(current, positions, id, position),
      );
      const displayPosition = Number.isInteger(position)
        ? Math.max(position, 0) + 1
        : 1;
      setLastAction(`${getItemTitle(id)} 已移动到第 ${displayPosition} 位`);
    },
    [],
  );

  const handleReset = useCallback((): void => {
    closeOpenSwipeable();
    setItems(INITIAL_ITEMS);
    setLastAction('列表已重置');
  }, [closeOpenSwipeable]);

  const renderItem = useCallback(
    (sortable: SortableRenderItemProps<TestItem>) => (
      <InteractiveRow
        onDelete={handleDelete}
        onDragStart={handleDragStart}
        onDrop={handleDrop}
        onPin={handlePin}
        onSwipeableClose={handleSwipeableClose}
        onSwipeableWillOpen={handleSwipeableWillOpen}
        sortable={sortable}
      />
    ),
    [
      handleDelete,
      handleDragStart,
      handleDrop,
      handlePin,
      handleSwipeableClose,
      handleSwipeableWillOpen,
    ],
  );

  return (
    <View style={styles.screen}>
      <Stack.Title>交互列表测试</Stack.Title>
      <View style={styles.statusBar}>
        <View style={styles.statusCopy}>
          <Text selectable style={styles.statusCount}>
            {items.length} 个项目
          </Text>
          <Text
            accessibilityLiveRegion="polite"
            selectable
            numberOfLines={1}
            style={styles.statusMessage}
          >
            {lastAction}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={handleReset}
          style={({ pressed }) => [
            styles.resetButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.resetButtonText}>重置</Text>
        </Pressable>
      </View>
      {items.length === 0 ? (
        <View style={styles.emptyState}>
          <Text selectable style={styles.emptyTitle}>
            列表为空
          </Text>
          <Text selectable style={styles.emptyDescription}>
            点击重置恢复测试项目。
          </Text>
        </View>
      ) : (
        <Sortable
          contentContainerStyle={styles.listContent}
          data={items}
          itemHeight={ITEM_HEIGHT}
          itemKeyExtractor={(item: TestItem) => item.id}
          renderItem={renderItem}
          style={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  action: { height: ITEM_HEIGHT, width: ACTION_WIDTH },
  actionButton: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  dragHandle: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  dragHandleBar: {
    backgroundColor: COLORS.muted,
    borderRadius: 1,
    height: 2,
    width: 18,
  },
  dragHandleIcon: {
    alignItems: 'center',
    gap: 4,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 36,
  },
  emptyDescription: { color: COLORS.muted, fontSize: 14 },
  emptyState: {
    alignItems: 'center',
    flex: 1,
    gap: 6,
    justifyContent: 'center',
    padding: 24,
  },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: '700' },
  list: { backgroundColor: COLORS.background, flex: 1 },
  listContent: { paddingBottom: 32 },
  orderBadge: {
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderCurve: 'continuous',
    borderRadius: 6,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  orderText: {
    color: COLORS.accent,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  pressed: { opacity: 0.65 },
  resetButton: {
    alignItems: 'center',
    borderColor: COLORS.border,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  resetButtonText: { color: COLORS.accent, fontSize: 14, fontWeight: '700' },
  row: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderBottomColor: COLORS.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    height: ITEM_HEIGHT,
    paddingHorizontal: 12,
  },
  rowCopy: { flex: 1, gap: 3, minWidth: 0 },
  rowDescription: { color: COLORS.muted, fontSize: 13, lineHeight: 17 },
  rowTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  screen: { backgroundColor: COLORS.background, flex: 1 },
  statusBar: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderBottomColor: COLORS.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 16,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  statusCopy: { flex: 1, gap: 3, minWidth: 0 },
  statusCount: {
    color: COLORS.text,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  statusMessage: { color: COLORS.muted, fontSize: 13 },
  swipeable: { height: ITEM_HEIGHT, overflow: 'hidden' },
  swipeableChildren: { backgroundColor: COLORS.surface },
});
