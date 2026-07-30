import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { RecyclerList } from '../RecyclerList';
import {
  RecyclerGridList,
  RecyclerHorizontalList,
  RecyclerMasonryList,
} from '../RecyclerList.presets';
import {
  LoadMoreState,
  NativeRefreshPhase,
  SecondLevelPhase,
  type RefreshHeaderContext,
  type RecyclerRenderItemInfo,
} from '../types';

/** 基础测试页面共用的中性色与状态强调色。 */
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

/** 将原生刷新阶段映射为测试刷新头显示的离散文案。 */
const REFRESH_PHASE_LABELS = {
  [NativeRefreshPhase.IDLE]: '下拉刷新',
  [NativeRefreshPhase.PULLING]: '继续下拉',
  [NativeRefreshPhase.READY]: '松开立即刷新',
  [NativeRefreshPhase.REFRESHING]: '正在刷新...',
  [NativeRefreshPhase.SETTLING]: '刷新完成',
} as const;

/** 将时间格式化为刷新头使用的二十四小时制小时和分钟。 */
function formatRefreshTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * 九个集成场景共用的自定义刷新头。
 *
 * 箭头旋转直接读取 Reanimated `SharedValue`，用于验证 Fabric 高频事件没有经过
 * React 逐帧渲染；启用二楼时优先显示第二段手势进度和提示文案。
 */
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

/**
 * 为测试页面提供可复用的受控刷新状态。
 *
 * 每次刷新保持 900 毫秒后自动结束；组件卸载时清理计时器，避免切换测试路由后
 * 继续更新已经卸载的页面。
 */
export function useTestRefresh(): {
  /** 由列表达到第一阈值并松手时调用。 */
  onRefresh: () => void;
  /** 传给列表的受控刷新状态。 */
  refreshing: boolean;
  /** 渲染支持普通刷新和二楼提示的统一刷新头。 */
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

/** 基础测试页面外壳属性。 */
type TestShellProps = {
  /** 标识当前场景关注能力的短标签。 */
  badge: string;
  /** 占满剩余空间的列表测试内容。 */
  children: React.ReactNode;
  /** 当前测试数据项总数。 */
  count: number;
  /** 页面主标题。 */
  title: string;
};

/** 统一基础场景的安全区、标题和数据量显示，不参与被测列表滚动。 */
function TestShell({
  badge,
  children,
  count,
  title,
}: TestShellProps): React.JSX.Element {
  return (
    <View style={styles.safeArea}>
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
    </View>
  );
}

/**
 * 精选瀑布流的数据联合。
 *
 * `section` 是必须通栏的吸顶标题，`story` 是具有不同预设高度的普通瀑布流卡片。
 */
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

/** 同时覆盖通栏吸顶、异构类型和动态卡片高度的固定测试数据。 */
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

/**
 * 验证两列瀑布流、通栏吸顶项目、异构宿主复用和统一下拉刷新的集成场景。
 */
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

/** 动态测量场景中的单张瀑布流卡片。 */
type DynamicCard = {
  /** 跨重排保持稳定的项目键。 */
  id: string;
  /** 卡片标题。 */
  label: string;
  /** 形成不同实测高度的正文。 */
  body: string;
  /** 区分相邻测试卡片的背景色。 */
  tone: string;
};

/** 用不同文本长度和换行情况制造真实动态高度。 */
const DYNAMIC_BODIES = [
  '短内容。',
  '内容完成布局后，将真实高度同步给原生尺寸缓存。',
  '这张卡片包含更多文本，用于观察瀑布流在高度变化后是否会选择当前最短列，并维持屏幕中的可视锚点。',
  '两行文本用于形成中等高度的卡片。\n第二行继续参与测量。',
  '快速滚动后返回此处，卡片应继续使用已经记录的真实尺寸，而不是重新依赖预估高度。',
] as const;

/** 重复正文样本生成足以触发快速滚动和回收的动态高度数据。 */
const DYNAMIC_CARDS: DynamicCard[] = Array.from({ length: 60 }, (_, index) => ({
  id: `dynamic-${index}`,
  label: `测量样本 ${String(index + 1).padStart(2, '0')}`,
  body: DYNAMIC_BODIES[index % DYNAMIC_BODIES.length],
  tone: ['#dcece5', '#f3e7dd', '#e3e9f4', '#eee7f1'][index % 4],
}));

/** 验证真实尺寸回传、瀑布流局部重排和可视锚点保持。 */
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

/** 短列表项使用的稳定数据结构。 */
type CompactItem = {
  /** 数据差异和回收重挂载使用的稳定键。 */
  id: string;
  /** 单行显示的主要内容。 */
  label: string;
  /** 用于观察快速滚动时内容是否串项的固定状态。 */
  status: '就绪' | '测量' | '回收';
};

/** 大量固定短项目，用于增加单次滚动跨越的回收槽位数量。 */
const COMPACT_ITEMS: CompactItem[] = Array.from(
  { length: 160 },
  (_, index) => ({
    id: `compact-${index}`,
    label: `紧凑记录 ${String(index + 1).padStart(3, '0')}`,
    status: (['就绪', '测量', '回收'] as const)[index % 3],
  }),
);

/** 验证高密度短项目在快速滚动下的绑定顺序和复用稳定性。 */
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

/** 纵向父列表中的一个横向分组。 */
type Shelf = {
  /** 同时作为父项键和子列表 `listKey`。 */
  id: string;
  /** 分组标题。 */
  title: string;
  /** 分组识别色。 */
  accent: string;
};

/** 横向子列表中的卡片数据。 */
type ShelfItem = {
  /** 当前分组内稳定且唯一的项目键。 */
  id: string;
  /** 卡片标题。 */
  title: string;
  /** 用于快速识别滚动位置的百分比文本。 */
  value: string;
};

/** 生成足够多的纵向分组，确保父项离屏后会发生回收。 */
const SHELVES: Shelf[] = Array.from({ length: 24 }, (_, index) => ({
  id: `shelf-${index}`,
  title: `横向分组 ${String(index + 1).padStart(2, '0')}`,
  accent: ['#147d64', '#d56843', '#4267a9', '#8b5a92'][index % 4],
}));

/**
 * 单个可回收父项中的横向列表。
 *
 * `listKey` 复用分组键，用于验证父项回收并重新挂载后能够恢复各自的横向位置。
 */
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

/** 验证纵向主列表嵌套横向列表及每个子列表的独立位置恢复。 */
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

/** 分页追加场景中的一条内容记录。 */
type LoadMoreItem = {
  /** 跨分页追加保持唯一的项目键。 */
  id: string;
  /** 当前项目所属的十二项数据批次。 */
  batch: number;
  /** 行标题。 */
  title: string;
};

/**
 * 创建连续且键稳定的分页测试数据。
 *
 * @param start 第一条数据的全局零基索引。
 * @param count 本批生成的数据量。
 */
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

/**
 * 验证触底去重、分页追加、失败重试和完成态禁用。
 *
 * 第二次加载固定失败，便于手工检查 `retryEndReached()` 对错误状态的恢复；数据达到
 * 72 项后进入完成态，不应继续触发加载。
 */
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

/** 回收重挂载场景中的异构项目。 */
type RecycleItem = {
  /** 用于隔离 React 局部状态的稳定项目键。 */
  id: string;
  /** 决定原生回收池类型和卡片内部控件。 */
  kind: 'metric' | 'toggle';
  /** 卡片标题。 */
  title: string;
  /** 计数卡片的基础数值。 */
  value: number;
};

/** 生成远多于可视槽位数量的异构数据，以持续触发宿主复用。 */
const RECYCLE_ITEMS: RecycleItem[] = Array.from(
  { length: 240 },
  (_, index) => ({
    id: `recycle-${index}`,
    kind: index % 3 === 0 ? 'toggle' : 'metric',
    title: index % 3 === 0 ? `开关槽位 ${index + 1}` : `计数槽位 ${index + 1}`,
    value: (index * 17) % 100,
  }),
);

/**
 * 带 React 局部状态的可回收卡片。
 *
 * 开关与计数状态用于检查槽位绑定到新 `itemKey` 后子树是否重新挂载，防止状态从
 * 已离屏项目泄漏到新的数据项。
 */
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

/** 验证按 `itemType` 分类的原生回收以及 React 子树状态隔离。 */
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
