import { FlashList } from '@shopify/flash-list';
import { Color, Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type ColorValue,
} from 'react-native';
import {
  type InteractiveListActionInfo,
  InteractiveListItem,
  type InteractiveListItemRenderInfo,
  InteractiveListProvider,
  useInteractiveList,
} from 'react-native-components';
import Animated, {
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

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

const STATIC_ACTION_COLORS = {
  delete: '#c62828',
  pin: '#1769aa',
};

interface TestItem {
  description: string;
  id: string;
  title: string;
}

const INITIAL_ITEMS: TestItem[] = Array.from({ length: 24 }, (_, index) => ({
  description:
    index % 3 === 0
      ? '包含更长的辅助内容，用于验证不同高度项目交换时的位置计算和让位距离。'
      : index % 3 === 1
        ? '中等高度项目。'
        : '短项目',
  id: `interactive-item-${index + 1}`,
  title: `项目 ${String(index + 1).padStart(2, '0')}`,
}));

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
    opacity: interpolate(progress.value, [0, 1], [0.35, 1], 'clamp'),
    transform: [
      { scale: interpolate(progress.value, [0, 1], [0.85, 1], 'clamp') },
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

interface InteractiveListBodyProps {
  listType: 'flash-list' | 'flat-list';
  renderItem: (
    info: InteractiveListItemRenderInfo<TestItem>,
  ) => React.ReactElement;
  renderLeftActions: (
    info: InteractiveListActionInfo<TestItem>,
  ) => React.ReactNode;
  renderRightActions: (
    info: InteractiveListActionInfo<TestItem>,
  ) => React.ReactNode;
}

function InteractiveListBody({
  listType,
  renderItem,
  renderLeftActions,
  renderRightActions,
}: InteractiveListBodyProps): React.JSX.Element {
  const interactiveList = useInteractiveList<TestItem>();
  const renderListItem = useCallback(
    ({ item, index }: { item: TestItem; index: number }) => (
      <InteractiveListItem
        index={index}
        item={item}
        renderLeftActions={renderLeftActions}
        renderRightActions={renderRightActions}
      >
        {renderItem}
      </InteractiveListItem>
    ),
    [renderItem, renderLeftActions, renderRightActions],
  );

  if (listType === 'flash-list') {
    return (
      <FlashList
        contentContainerStyle={styles.listContent}
        contentInsetAdjustmentBehavior="automatic"
        data={interactiveList.data}
        drawDistance={interactiveList.dragRenderDistance}
        extraData={interactiveList.extraData}
        keyExtractor={interactiveList.keyExtractor}
        onScroll={interactiveList.onScroll}
        onScrollBeginDrag={interactiveList.onScrollBeginDrag}
        ref={interactiveList.listRef}
        renderItem={renderListItem}
        scrollEventThrottle={interactiveList.scrollEventThrottle}
        showsVerticalScrollIndicator={false}
      />
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      contentInsetAdjustmentBehavior="automatic"
      data={interactiveList.data}
      extraData={interactiveList.extraData}
      keyExtractor={interactiveList.keyExtractor}
      maxToRenderPerBatch={
        interactiveList.isDragging ? interactiveList.data.length : undefined
      }
      onScroll={interactiveList.onScroll}
      onScrollBeginDrag={interactiveList.onScrollBeginDrag}
      ref={interactiveList.listRef}
      removeClippedSubviews={interactiveList.isDragging ? false : undefined}
      renderItem={renderListItem}
      scrollEventThrottle={interactiveList.scrollEventThrottle}
      showsVerticalScrollIndicator={false}
      windowSize={
        interactiveList.isDragging
          ? Math.max(interactiveList.data.length, 21)
          : undefined
      }
    />
  );
}

export function InteractiveListTestScreen(): React.JSX.Element {
  useColorScheme();
  const [items, setItems] = useState(INITIAL_ITEMS);
  const [listType, setListType] = useState<'flash-list' | 'flat-list'>(
    'flash-list',
  );
  const orderById = useMemo(
    () => new Map(items.map((item, index) => [item.id, index + 1])),
    [items],
  );

  const handleReorder = useCallback((nextData: TestItem[]): void => {
    setItems(nextData);
  }, []);

  const renderItem = useCallback(
    ({ isDragging, item }: InteractiveListItemRenderInfo<TestItem>) => (
      <View style={[styles.row, isDragging && styles.draggingRow]}>
        <View style={styles.orderBadge}>
          <Text selectable style={styles.orderText}>
            {orderById.get(item.id)}
          </Text>
        </View>
        <View style={styles.rowCopy}>
          <Text selectable style={styles.rowTitle}>
            {item.title}
          </Text>
          <Text selectable style={styles.rowDescription}>
            {item.description}
          </Text>
        </View>
        <Text accessibilityLabel="拖拽排序" style={styles.dragHandle}>
          ≡
        </Text>
      </View>
    ),
    [orderById],
  );

  const renderLeftActions = useCallback(
    ({ close, item, progress }: InteractiveListActionInfo<TestItem>) => (
      <SwipeAction
        backgroundColor={STATIC_ACTION_COLORS.pin}
        label="置顶"
        onPress={() => {
          close();
          setItems((current) => {
            const index = current.findIndex((entry) => entry.id === item.id);
            if (index <= 0) {
              return current;
            }
            const next = [...current];
            const [selected] = next.splice(index, 1);
            next.unshift(selected);
            return next;
          });
        }}
        progress={progress}
      />
    ),
    [],
  );

  const renderRightActions = useCallback(
    ({ close, item, progress }: InteractiveListActionInfo<TestItem>) => (
      <SwipeAction
        backgroundColor={STATIC_ACTION_COLORS.delete}
        label="删除"
        onPress={() => {
          close();
          setItems((current) =>
            current.filter((entry) => entry.id !== item.id),
          );
        }}
        progress={progress}
      />
    ),
    [],
  );

  return (
    <View style={styles.screen}>
      <Stack.Title>交互列表测试</Stack.Title>
      <View style={styles.toolbar}>
        {(['flash-list', 'flat-list'] as const).map((option) => {
          const selected = option === listType;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={option}
              onPress={() => setListType(option)}
              style={[styles.modeButton, selected && styles.modeButtonSelected]}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  selected && styles.modeButtonTextSelected,
                ]}
              >
                {option === 'flash-list' ? 'FlashList' : 'FlatList'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <InteractiveListProvider
        data={items}
        estimatedItemSize={88}
        keyExtractor={(item) => item.id}
        onReorder={handleReorder}
      >
        <InteractiveListBody
          listType={listType}
          renderItem={renderItem}
          renderLeftActions={renderLeftActions}
          renderRightActions={renderRightActions}
        />
      </InteractiveListProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  action: { width: 88 },
  actionButton: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 64,
    paddingHorizontal: 12,
  },
  actionText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  draggingRow: { boxShadow: '0 8px 20px rgba(0, 0, 0, 0.18)' },
  dragHandle: {
    color: COLORS.muted,
    fontSize: 24,
    height: 36,
    lineHeight: 30,
    textAlign: 'center',
    width: 32,
  },
  listContent: { paddingBottom: 32 },
  modeButton: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 5,
    flex: 1,
    height: 34,
    justifyContent: 'center',
  },
  modeButtonSelected: {
    backgroundColor: COLORS.surface,
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.12)',
  },
  modeButtonText: { color: COLORS.muted, fontSize: 13, fontWeight: '600' },
  modeButtonTextSelected: { color: COLORS.text },
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
  pressed: { opacity: 0.7 },
  row: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderBottomColor: COLORS.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowCopy: { flex: 1, gap: 4 },
  rowDescription: { color: COLORS.muted, fontSize: 13, lineHeight: 18 },
  rowTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  screen: { backgroundColor: COLORS.background, flex: 1 },
  toolbar: {
    backgroundColor: COLORS.border,
    borderCurve: 'continuous',
    borderRadius: 7,
    flexDirection: 'row',
    gap: 2,
    marginHorizontal: 16,
    marginVertical: 10,
    padding: 2,
  },
});
