import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import {
  LoadMoreState,
  NativeRefreshPhase,
  RecyclerGridList,
  RecyclerHorizontalList,
  RecyclerList,
  RecyclerMasonryList,
  SecondLevelPhase,
  type RefreshHeaderContext,
  type RecyclerRenderItemInfo,
} from 'react-native-nitro-recycler-list';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = {
  background: '#f2f4f1',
  border: '#d9dfda',
  dark: '#18221e',
  green: '#147d64',
  muted: '#66766e',
  orange: '#d56843',
  surface: '#ffffff',
  yellow: '#d6a133',
} as const;

const REFRESH_PHASE_LABELS = {
  [NativeRefreshPhase.IDLE]: '下拉刷新',
  [NativeRefreshPhase.PULLING]: '继续下拉',
  [NativeRefreshPhase.READY]: '松开立即刷新',
  [NativeRefreshPhase.REFRESHING]: '正在刷新...',
  [NativeRefreshPhase.SETTLING]: '刷新完成',
} as const;

function formatRefreshTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function RecyclerTestRefreshHeader({
  phase,
  progress,
  secondLevel,
}: RefreshHeaderContext): React.JSX.Element {
  const previousPhaseRef = useRef(phase);
  const [lastRefreshTime, setLastRefreshTime] = useState(() =>
    formatRefreshTime(new Date()),
  );
  const arrowProgress = secondLevel?.progress ?? progress;
  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${arrowProgress.value * 180}deg` }],
  }));

  useEffect(() => {
    if (
      phase === NativeRefreshPhase.REFRESHING &&
      previousPhaseRef.current !== NativeRefreshPhase.REFRESHING
    ) {
      setLastRefreshTime(formatRefreshTime(new Date()));
    }
    previousPhaseRef.current = phase;
  }, [phase]);

  return (
    <View style={styles.refreshHeader}>
      <View style={styles.refreshIconSlot}>
        {phase === NativeRefreshPhase.REFRESHING ? (
          <ActivityIndicator color={COLORS.dark} size="small" />
        ) : (
          <Animated.Text style={[styles.refreshArrow, arrowStyle]}>
            ↓
          </Animated.Text>
        )}
      </View>
      <View style={styles.refreshCopy}>
        <Text style={styles.refreshTitle}>
          {secondLevel?.phase === SecondLevelPhase.READY
            ? '松开进入二楼'
            : secondLevel?.phase === SecondLevelPhase.PULLING
              ? '继续下拉进入二楼'
              : REFRESH_PHASE_LABELS[phase]}
        </Text>
        <Text style={styles.refreshTime}>最后更新：{lastRefreshTime}</Text>
      </View>
    </View>
  );
}

export function useTestRefresh(): {
  onRefresh: () => void;
  refreshing: boolean;
  renderRefreshHeader: (context: RefreshHeaderContext) => React.JSX.Element;
} {
  const [refreshing, setRefreshing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  const onRefresh = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    setRefreshing(true);
    timerRef.current = setTimeout(() => {
      setRefreshing(false);
      timerRef.current = null;
    }, 900);
  }, []);

  const renderRefreshHeader = useCallback(
    (context: RefreshHeaderContext) => (
      <RecyclerTestRefreshHeader {...context} />
    ),
    [],
  );

  return { onRefresh, refreshing, renderRefreshHeader };
}

type TestShellProps = {
  badge: string;
  children: React.ReactNode;
  count: number;
  title: string;
};

function TestShell({
  badge,
  children,
  count,
  title,
}: TestShellProps): React.JSX.Element {
  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <View style={styles.screenHeader}>
        <View style={styles.screenHeading}>
          <Text style={styles.screenEyebrow}>{badge}</Text>
          <Text style={styles.screenTitle}>{title}</Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countValue}>{count}</Text>
          <Text style={styles.countLabel}>项</Text>
        </View>
      </View>
      <View style={styles.listFrame}>{children}</View>
    </SafeAreaView>
  );
}

type FeaturedItem =
  | { id: string; kind: 'section'; title: string }
  | {
      id: string;
      kind: 'story';
      title: string;
      summary: string;
      accent: string;
      height: number;
    };

const FEATURED_ITEMS: FeaturedItem[] = [
  { id: 'featured', kind: 'section', title: '精选内容' },
  {
    id: 'featured-architecture',
    kind: 'story',
    title: '原生布局引擎',
    summary: '布局、测量与回收统一在主线程协调。',
    accent: COLORS.green,
    height: 158,
  },
  {
    id: 'featured-anchor',
    kind: 'story',
    title: '可视锚点',
    summary: '尺寸变化后保持当前位置稳定。',
    accent: COLORS.orange,
    height: 126,
  },
  {
    id: 'featured-pool',
    kind: 'story',
    title: '分类回收池',
    summary: '异构内容按 itemType 隔离复用。',
    accent: '#4267a9',
    height: 144,
  },
  { id: 'engineering', kind: 'section', title: '工程记录' },
  ...Array.from(
    { length: 24 },
    (_, index): FeaturedItem => ({
      id: `engineering-${index}`,
      kind: 'story',
      title: `性能记录 ${String(index + 1).padStart(2, '0')}`,
      summary:
        index % 2 === 0
          ? '记录快速滚动期间的槽位绑定变化。'
          : '检查跨列内容和吸顶标题的位置。',
      accent: index % 3 === 0 ? COLORS.yellow : COLORS.green,
      height: 112 + (index % 3) * 24,
    }),
  ),
];

export function FeaturedContentTestScreen(): React.JSX.Element {
  const refresh = useTestRefresh();

  return (
    <TestShell
      badge="MASONRY · STICKY"
      count={FEATURED_ITEMS.length}
      title="精选内容"
    >
      <RecyclerMasonryList
        {...refresh}
        contentContainerStyle={styles.listContent}
        data={FEATURED_ITEMS}
        estimatedItemSize={132}
        getItemSpan={(item) => (item.kind === 'section' ? 2 : 1)}
        getItemType={(item) => item.kind}
        getStickyLevel={(item) => (item.kind === 'section' ? 0 : undefined)}
        keyExtractor={(item) => item.id}
        numColumns={2}
        renderItem={({ item }) =>
          item.kind === 'section' ? (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{item.title}</Text>
              <View style={styles.sectionRule} />
            </View>
          ) : (
            <View style={[styles.featuredCard, { minHeight: item.height }]}>
              <View
                style={[styles.cardAccent, { backgroundColor: item.accent }]}
              />
              <Text style={styles.cardIndex}>EDITORIAL</Text>
              <Text style={styles.featuredTitle}>{item.title}</Text>
              <Text style={styles.cardSummary}>{item.summary}</Text>
            </View>
          )
        }
      />
    </TestShell>
  );
}

type DynamicCard = {
  id: string;
  label: string;
  body: string;
  tone: string;
};

const DYNAMIC_BODIES = [
  '短内容。',
  '内容完成布局后，将真实高度同步给原生尺寸缓存。',
  '这张卡片包含更多文本，用于观察瀑布流在高度变化后是否会选择当前最短列，并维持屏幕中的可视锚点。',
  '两行文本用于形成中等高度的卡片。\n第二行继续参与测量。',
  '快速滚动后返回此处，卡片应继续使用已经记录的真实尺寸，而不是重新依赖预估高度。',
] as const;

const DYNAMIC_CARDS: DynamicCard[] = Array.from({ length: 60 }, (_, index) => ({
  id: `dynamic-${index}`,
  label: `测量样本 ${String(index + 1).padStart(2, '0')}`,
  body: DYNAMIC_BODIES[index % DYNAMIC_BODIES.length],
  tone: ['#dcece5', '#f3e7dd', '#e3e9f4', '#eee7f1'][index % 4],
}));

export function DynamicHeightCardsTestScreen(): React.JSX.Element {
  const refresh = useTestRefresh();

  return (
    <TestShell
      badge="MASONRY · MEASURE"
      count={DYNAMIC_CARDS.length}
      title="动态高度卡片"
    >
      <RecyclerMasonryList
        {...refresh}
        contentContainerStyle={styles.listContent}
        data={DYNAMIC_CARDS}
        estimatedItemSize={138}
        getItemType={() => 'dynamic-card'}
        keyExtractor={(item) => item.id}
        numColumns={2}
        renderItem={({ item, index }) => (
          <View style={[styles.dynamicCard, { backgroundColor: item.tone }]}>
            <Text style={styles.cardIndex}>
              #{String(index + 1).padStart(2, '0')}
            </Text>
            <Text style={styles.dynamicTitle}>{item.label}</Text>
            <Text style={styles.dynamicBody}>{item.body}</Text>
          </View>
        )}
      />
    </TestShell>
  );
}

type CompactItem = {
  id: string;
  label: string;
  status: '就绪' | '测量' | '回收';
};

const COMPACT_ITEMS: CompactItem[] = Array.from(
  { length: 160 },
  (_, index) => ({
    id: `compact-${index}`,
    label: `紧凑记录 ${String(index + 1).padStart(3, '0')}`,
    status: (['就绪', '测量', '回收'] as const)[index % 3],
  }),
);

export function ShortContentTestScreen(): React.JSX.Element {
  const refresh = useTestRefresh();

  return (
    <TestShell
      badge="LIST · COMPACT"
      count={COMPACT_ITEMS.length}
      title="较短内容"
    >
      <RecyclerList
        {...refresh}
        contentContainerStyle={styles.compactListContent}
        data={COMPACT_ITEMS}
        estimatedItemSize={52}
        getItemType={() => 'compact-row'}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <View style={styles.compactRow}>
            <Text style={styles.compactNumber}>
              {String(index + 1).padStart(3, '0')}
            </Text>
            <Text numberOfLines={1} style={styles.compactTitle}>
              {item.label}
            </Text>
            <Text style={styles.compactStatus}>{item.status}</Text>
          </View>
        )}
      />
    </TestShell>
  );
}

type Shelf = {
  id: string;
  title: string;
  accent: string;
};

type ShelfItem = {
  id: string;
  title: string;
  value: string;
};

const SHELVES: Shelf[] = Array.from({ length: 24 }, (_, index) => ({
  id: `shelf-${index}`,
  title: `横向分组 ${String(index + 1).padStart(2, '0')}`,
  accent: ['#147d64', '#d56843', '#4267a9', '#8b5a92'][index % 4],
}));

const HorizontalShelf = memo(function HorizontalShelf({
  shelf,
}: {
  shelf: Shelf;
}): React.JSX.Element {
  const items = useMemo<ShelfItem[]>(
    () =>
      Array.from({ length: 18 }, (_, index) => ({
        id: `${shelf.id}-item-${index}`,
        title: `项目 ${index + 1}`,
        value: `${(index + 1) * 8}%`,
      })),
    [shelf.id],
  );

  return (
    <View style={styles.shelf}>
      <View style={styles.shelfHeading}>
        <View style={[styles.shelfMarker, { backgroundColor: shelf.accent }]} />
        <Text style={styles.shelfTitle}>{shelf.title}</Text>
        <Text style={styles.shelfCount}>{items.length}</Text>
      </View>
      <View style={styles.horizontalListFrame}>
        <RecyclerHorizontalList
          data={items}
          estimatedItemSize={132}
          getItemType={() => 'shelf-card'}
          keyExtractor={(item) => item.id}
          listKey={shelf.id}
          renderItem={({ item }) => (
            <View style={styles.shelfCard}>
              <Text style={styles.shelfCardValue}>{item.value}</Text>
              <Text style={styles.shelfCardTitle}>{item.title}</Text>
            </View>
          )}
        />
      </View>
    </View>
  );
});

export function NestedHorizontalListsTestScreen(): React.JSX.Element {
  const refresh = useTestRefresh();

  return (
    <TestShell
      badge="NESTED · POSITION"
      count={SHELVES.length}
      title="横向嵌套列表"
    >
      <RecyclerList
        {...refresh}
        contentContainerStyle={styles.listContent}
        data={SHELVES}
        estimatedItemSize={188}
        getItemType={() => 'horizontal-shelf'}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <HorizontalShelf shelf={item} />}
      />
    </TestShell>
  );
}

type LoadMoreItem = {
  id: string;
  batch: number;
  title: string;
};

function createLoadMoreItems(start: number, count: number): LoadMoreItem[] {
  return Array.from({ length: count }, (_, offset) => {
    const index = start + offset;
    return {
      id: `load-more-${index}`,
      batch: Math.floor(index / 12) + 1,
      title: `内容记录 ${String(index + 1).padStart(2, '0')}`,
    };
  });
}

export function MoreContentTestScreen(): React.JSX.Element {
  const refresh = useTestRefresh();
  const [items, setItems] = useState(() => createLoadMoreItems(0, 24));
  const [loadMoreState, setLoadMoreState] = useState<LoadMoreState>(
    LoadMoreState.IDLE,
  );
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  const loadMore = useCallback(() => {
    if (
      loadMoreState === LoadMoreState.LOADING ||
      loadMoreState === LoadMoreState.FINISHED
    ) {
      return;
    }

    attemptRef.current += 1;
    setLoadMoreState(LoadMoreState.LOADING);
    timerRef.current = setTimeout(() => {
      if (attemptRef.current === 2) {
        setLoadMoreState(LoadMoreState.ERROR);
        return;
      }

      setItems((current) => {
        const next = [...current, ...createLoadMoreItems(current.length, 12)];
        setLoadMoreState(
          next.length >= 72 ? LoadMoreState.FINISHED : LoadMoreState.IDLE,
        );
        return next;
      });
    }, 650);
  }, [loadMoreState]);

  return (
    <TestShell
      badge="END REACHED · RETRY"
      count={items.length}
      title="更多内容"
    >
      <RecyclerList
        {...refresh}
        contentContainerStyle={styles.listContent}
        data={items}
        estimatedItemSize={76}
        getItemType={() => 'load-more-row'}
        keyExtractor={(item) => item.id}
        loadMoreState={loadMoreState}
        onEndReached={loadMore}
        onEndReachedThreshold={0.75}
        renderItem={({ item, index }) => (
          <View style={styles.loadMoreRow}>
            <View style={styles.batchBadge}>
              <Text style={styles.batchText}>B{item.batch}</Text>
            </View>
            <View style={styles.loadMoreCopy}>
              <Text style={styles.loadMoreTitle}>{item.title}</Text>
              <Text style={styles.loadMoreMeta}>
                索引 {index} · 数据批次 {item.batch}
              </Text>
            </View>
          </View>
        )}
        renderLoadMoreFooter={({ state, retry }) => (
          <View style={styles.loadMoreFooter}>
            {state === LoadMoreState.LOADING ? (
              <ActivityIndicator color={COLORS.green} />
            ) : null}
            {state === LoadMoreState.IDLE ? (
              <Text style={styles.footerText}>继续上滑</Text>
            ) : null}
            {state === LoadMoreState.ERROR ? (
              <Pressable
                accessibilityRole="button"
                onPress={retry}
                style={({ pressed }) => [
                  styles.retryButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.retryText}>加载失败 · 点击重试</Text>
              </Pressable>
            ) : null}
            {state === LoadMoreState.FINISHED ? (
              <Text style={styles.footerText}>已加载全部 72 项</Text>
            ) : null}
          </View>
        )}
      />
    </TestShell>
  );
}

type RecycleItem = {
  id: string;
  kind: 'metric' | 'toggle';
  title: string;
  value: number;
};

const RECYCLE_ITEMS: RecycleItem[] = Array.from(
  { length: 240 },
  (_, index) => ({
    id: `recycle-${index}`,
    kind: index % 3 === 0 ? 'toggle' : 'metric',
    title: index % 3 === 0 ? `开关槽位 ${index + 1}` : `计数槽位 ${index + 1}`,
    value: (index * 17) % 100,
  }),
);

const RecycleCard = memo(function RecycleCard({
  info,
}: {
  info: RecyclerRenderItemInfo<RecycleItem>;
}): React.JSX.Element {
  const { item, itemKey, itemType } = info;
  const [count, setCount] = useState(0);
  const [enabled, setEnabled] = useState(false);

  return (
    <View style={styles.recycleCard}>
      <View style={styles.recycleHeading}>
        <Text style={styles.recycleType}>{itemType.toUpperCase()}</Text>
        <Text numberOfLines={1} style={styles.recycleKey}>
          {itemKey}
        </Text>
      </View>
      <Text style={styles.recycleTitle}>{item.title}</Text>
      {item.kind === 'toggle' ? (
        <View style={styles.recycleControlRow}>
          <Text style={styles.recycleValue}>
            {enabled ? '已开启' : '已关闭'}
          </Text>
          <Switch onValueChange={setEnabled} value={enabled} />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setCount((value) => value + 1)}
          style={({ pressed }) => [
            styles.counterButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.counterLabel}>局部计数</Text>
          <Text style={styles.counterValue}>{item.value + count}</Text>
        </Pressable>
      )}
    </View>
  );
});

export function RecycledItemsTestScreen(): React.JSX.Element {
  const refresh = useTestRefresh();

  return (
    <TestShell
      badge="POOL · REMOUNT"
      count={RECYCLE_ITEMS.length}
      title="回收项"
    >
      <RecyclerGridList
        {...refresh}
        contentContainerStyle={styles.listContent}
        data={RECYCLE_ITEMS}
        estimatedItemSize={126}
        getItemType={(item) => item.kind}
        keyExtractor={(item) => item.id}
        numColumns={2}
        overscan={0.5}
        renderItem={(info) => <RecycleCard info={info} />}
      />
    </TestShell>
  );
}

const styles = StyleSheet.create({
  batchBadge: {
    alignItems: 'center',
    backgroundColor: COLORS.dark,
    borderRadius: 4,
    height: 36,
    justifyContent: 'center',
    width: 42,
  },
  batchText: {
    color: COLORS.surface,
    fontSize: 11,
    fontWeight: '800',
  },
  cardAccent: {
    borderRadius: 2,
    height: 5,
    marginBottom: 16,
    width: 36,
  },
  cardIndex: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '800',
  },
  cardSummary: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },
  compactListContent: {
    paddingBottom: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  compactNumber: {
    color: COLORS.muted,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    width: 34,
  },
  compactRow: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderBottomColor: COLORS.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 48,
    paddingHorizontal: 12,
  },
  compactStatus: {
    color: COLORS.green,
    fontSize: 11,
    fontWeight: '700',
  },
  compactTitle: {
    color: COLORS.dark,
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  countBadge: {
    alignItems: 'baseline',
    backgroundColor: '#e6ece8',
    borderRadius: 5,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  countLabel: {
    color: COLORS.muted,
    fontSize: 10,
  },
  countValue: {
    color: COLORS.dark,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  counterButton: {
    alignItems: 'center',
    backgroundColor: '#e6ece8',
    borderRadius: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    minHeight: 38,
    paddingHorizontal: 11,
  },
  counterLabel: {
    color: COLORS.dark,
    fontSize: 12,
    fontWeight: '700',
  },
  counterValue: {
    color: COLORS.green,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  dynamicBody: {
    color: '#405049',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
  },
  dynamicCard: {
    borderColor: 'rgba(24, 34, 30, 0.09)',
    borderRadius: 6,
    borderWidth: 1,
    padding: 15,
  },
  dynamicTitle: {
    color: COLORS.dark,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 7,
  },
  featuredCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 6,
    borderWidth: 1,
    padding: 15,
  },
  featuredTitle: {
    color: COLORS.dark,
    fontSize: 17,
    fontWeight: '800',
    marginTop: 7,
  },
  footerText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  horizontalListFrame: {
    height: 116,
    marginTop: 12,
  },
  listContent: {
    paddingBottom: 28,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  listFrame: {
    flex: 1,
  },
  loadMoreCopy: {
    flex: 1,
    gap: 4,
  },
  loadMoreFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 72,
    padding: 14,
  },
  loadMoreMeta: {
    color: COLORS.muted,
    fontSize: 11,
  },
  loadMoreRow: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 5,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 68,
    padding: 12,
  },
  loadMoreTitle: {
    color: COLORS.dark,
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.68,
  },
  recycleCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 122,
    padding: 13,
  },
  recycleControlRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 9,
    minHeight: 42,
  },
  recycleHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  recycleKey: {
    color: COLORS.muted,
    flex: 1,
    fontSize: 9,
  },
  recycleTitle: {
    color: COLORS.dark,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 10,
  },
  recycleType: {
    color: COLORS.orange,
    fontSize: 9,
    fontWeight: '900',
  },
  recycleValue: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  refreshArrow: {
    color: COLORS.dark,
    fontSize: 26,
    lineHeight: 30,
    textAlign: 'center',
  },
  refreshCopy: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 154,
  },
  refreshHeader: {
    alignItems: 'center',
    backgroundColor: '#e6ece8',
    flexDirection: 'row',
    height: 80,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  refreshIconSlot: {
    alignItems: 'center',
    height: 30,
    justifyContent: 'center',
    marginRight: 10,
    width: 30,
  },
  refreshTime: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 4,
  },
  refreshTitle: {
    color: COLORS.dark,
    fontSize: 14,
    fontWeight: '600',
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: COLORS.orange,
    borderRadius: 5,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  retryText: {
    color: COLORS.surface,
    fontSize: 12,
    fontWeight: '800',
  },
  safeArea: {
    backgroundColor: COLORS.background,
    flex: 1,
  },
  screenEyebrow: {
    color: COLORS.green,
    fontSize: 10,
    fontWeight: '900',
  },
  screenHeader: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 74,
    paddingHorizontal: 18,
  },
  screenHeading: {
    flex: 1,
    gap: 4,
  },
  screenTitle: {
    color: COLORS.dark,
    fontSize: 20,
    fontWeight: '800',
  },
  sectionHeader: {
    alignItems: 'center',
    backgroundColor: COLORS.dark,
    flexDirection: 'row',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 15,
  },
  sectionRule: {
    backgroundColor: COLORS.orange,
    height: 3,
    width: 28,
  },
  sectionTitle: {
    color: COLORS.surface,
    fontSize: 15,
    fontWeight: '800',
  },
  shelf: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 176,
    padding: 14,
  },
  shelfCard: {
    backgroundColor: '#e8eeea',
    borderRadius: 5,
    height: 108,
    justifyContent: 'space-between',
    marginRight: 9,
    padding: 12,
    width: 124,
  },
  shelfCardTitle: {
    color: COLORS.dark,
    fontSize: 12,
    fontWeight: '700',
  },
  shelfCardValue: {
    color: COLORS.green,
    fontSize: 21,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  shelfCount: {
    color: COLORS.muted,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  shelfHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  shelfMarker: {
    borderRadius: 2,
    height: 16,
    width: 4,
  },
  shelfTitle: {
    color: COLORS.dark,
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
  },
});
