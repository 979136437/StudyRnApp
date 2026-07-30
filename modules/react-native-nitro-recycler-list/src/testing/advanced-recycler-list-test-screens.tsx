import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RecyclerList } from '../RecyclerList';
import {
  RecyclerGroupedStickyList,
  RecyclerSecondLevelList,
} from '../RecyclerList.presets';
import { RecyclerTabView } from '../RecyclerTabView';
import type { RecyclerTabItem } from '../RecyclerTabView.types';
import type { SecondLevelContentContext, SecondLevelOptions } from '../types';
import { useTestRefresh } from './recycler-list-test-screens';

/** 高级滚动场景共用的背景、文本与状态强调色。 */
const COLORS = {
  background: '#eef2ef',
  border: '#d5ddd8',
  dark: '#18221e',
  green: '#147d64',
  muted: '#66766e',
  orange: '#d56843',
  surface: '#ffffff',
  yellow: '#d6a133',
} as const;

/** 带场景识别色的折叠页签描述。 */
type DemoTab = RecyclerTabItem & {
  /** 当前页签卡片使用的强调色。 */
  accent: string;
};

/** 折叠多页中用于形成动态高度的列表卡片。 */
type TabCard = {
  /** 在所属页签内稳定且唯一的项目键。 */
  id: string;
  /** 卡片标题。 */
  title: string;
  /** 描述当前手工验收动作的正文。 */
  detail: string;
  /** 用于检查切页后测量缓存和深层偏移恢复的最小高度。 */
  height: number;
};

/** 三个稳定页签用于同时验证点击切换和左右滑页。 */
const TABS: readonly DemoTab[] = [
  { key: 'selected', title: '精选', accent: COLORS.green },
  { key: 'latest', title: '最新', accent: COLORS.orange },
  { key: 'saved', title: '收藏', accent: COLORS.yellow },
];

/** 为每个页签生成独立键空间和不同高度分布的长列表数据。 */
const TAB_DATA = Object.fromEntries(
  TABS.map((tab, tabIndex) => [
    tab.key,
    Array.from(
      { length: 36 },
      (_, index): TabCard => ({
        id: `${tab.key}-${index}`,
        title: `${tab.title}内容 ${String(index + 1).padStart(2, '0')}`,
        detail:
          index % 3 === 0
            ? '动态高度内容，用于检查切页后的原生偏移恢复。'
            : '滚动后切换页面，再返回检查位置。',
        height: 92 + ((index + tabIndex) % 4) * 18,
      }),
    ),
  ]),
) as Record<string, TabCard[]>;

/**
 * 验证共享折叠头、多页横向切换和每页原生滚动位置恢复。
 *
 * 每个场景直接返回 `RecyclerList`，并提供稳定 `listKey`；切换页签前后应保留已经
 * 越过折叠区间的深层位置，未完全折叠时则同步当前折叠量。
 */
export function CollapsibleTabsTestScreen(): React.JSX.Element {
  const refresh = useTestRefresh();

  const renderScene = useCallback(
    (tab: DemoTab) => (
      <RecyclerList
        {...refresh}
        contentContainerStyle={styles.list}
        data={TAB_DATA[tab.key] ?? []}
        estimatedItemSize={120}
        getItemType={() => `tab-card-${tab.key}`}
        keyExtractor={(item) => item.id}
        listKey={`collapsible-${tab.key}`}
        renderItem={({ item }) => (
          <View style={[styles.tabCard, { minHeight: item.height }]}>
            <View
              style={[styles.cardMarker, { backgroundColor: tab.accent }]}
            />
            <View style={styles.cardCopy}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardDetail}>{item.detail}</Text>
            </View>
          </View>
        )}
      />
    ),
    [refresh],
  );

  return (
    <View style={styles.safeArea}>
      <RecyclerTabView
        collapsedHeaderHeight={0}
        defaultActiveKey="selected"
        renderHeader={() => (
          <View style={styles.sharedHeader}>
            <Text style={styles.eyebrow}>COLLAPSIBLE · NATIVE OFFSETS</Text>
            <Text style={styles.heroTitle}>共享折叠头</Text>
            <Text style={styles.heroCopy}>
              先折叠头部，再滚动当前列表。左右滑页后保留每页深层位置。
            </Text>
            <View style={styles.headerStats}>
              <Text style={styles.headerStat}>3 个原生列表</Text>
              <Text style={styles.headerStat}>每页 36 项</Text>
            </View>
          </View>
        )}
        renderScene={renderScene}
        tabs={TABS}
      />
    </View>
  );
}

/**
 * 分组多层吸顶测试数据。
 *
 * `group` 是零级组标题，`section` 是一级分区标题，`content` 是不参与吸顶的普通
 * 行。判别字段确保普通行不会意外提供吸顶层级或组键。
 */
type StickyItem =
  | {
      id: string;
      kind: 'group';
      group: string;
      level: 0;
      title: string;
      accent: string;
    }
  | {
      id: string;
      kind: 'section';
      group: string;
      level: 1;
      title: string;
      accent: string;
    }
  | {
      id: string;
      kind: 'content';
      group: string;
      title: string;
      detail: string;
    };

/**
 * 生成三个吸顶组，每组包含一个零级标题和三个一级标题。
 *
 * 新组零级标题到达吸顶边界时，应整体推走上一组完整的两级吸顶栈。
 */
const STICKY_ITEMS: StickyItem[] = ['产品', '工程', '运营'].flatMap(
  (group, groupIndex) => {
    const accent = [COLORS.green, COLORS.orange, '#4267a9'][groupIndex]!;
    return [
      {
        id: `group-${groupIndex}`,
        kind: 'group',
        group,
        level: 0,
        title: `${group}组`,
        accent,
      },
      ...['概览', '进展', '记录'].flatMap(
        (section, sectionIndex): StickyItem[] => [
          {
            id: `section-${groupIndex}-${sectionIndex}`,
            kind: 'section',
            group,
            level: 1,
            title: section,
            accent,
          },
          ...Array.from(
            { length: 5 },
            (_, itemIndex): StickyItem => ({
              id: `content-${groupIndex}-${sectionIndex}-${itemIndex}`,
              kind: 'content',
              group,
              title: `${group} · ${section} ${itemIndex + 1}`,
              detail: '同组两级叠放；下一组到达时整体推走当前吸顶栈。',
            }),
          ),
        ],
      ),
    ];
  },
);

/** 验证同组层级叠放、同层推顶以及跨组完整排斥退出。 */
export function ComplexStickyTestScreen(): React.JSX.Element {
  const refresh = useTestRefresh();
  return (
    <AdvancedShell eyebrow="STICKY · GROUP EXCLUSION" title="复杂吸顶">
      <RecyclerGroupedStickyList
        {...refresh}
        contentContainerStyle={styles.list}
        data={STICKY_ITEMS}
        estimatedItemSize={86}
        getItemType={(item) => item.kind}
        getStickyGroup={(item) =>
          item.kind === 'content' ? undefined : item.group
        }
        getStickyLevel={(item) =>
          item.kind === 'content' ? undefined : item.level
        }
        keyExtractor={(item) => item.id}
        renderItem={({ item }) =>
          item.kind === 'content' ? (
            <View style={styles.stickyContent}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardDetail}>{item.detail}</Text>
            </View>
          ) : (
            <View
              style={[
                item.kind === 'group'
                  ? styles.groupHeader
                  : styles.sectionHeader,
                { borderLeftColor: item.accent },
              ]}
            >
              <Text
                style={
                  item.kind === 'group'
                    ? styles.groupTitle
                    : styles.sectionTitle
                }
              >
                {item.title}
              </Text>
              <Text style={styles.levelLabel}>层级 {item.level}</Text>
            </View>
          )
        }
      />
    </AdvancedShell>
  );
}

/** 下拉二级主列表中的固定行数据。 */
type SecondItem = {
  /** 原生差异更新使用的稳定键。 */
  id: string;
  /** 行标题。 */
  title: string;
};

/** 提供足够滚动距离的二楼主列表数据。 */
const SECOND_ITEMS: SecondItem[] = Array.from({ length: 32 }, (_, index) => ({
  id: `second-${index}`,
  title: `主列表内容 ${String(index + 1).padStart(2, '0')}`,
}));

/**
 * 验证普通刷新与二楼请求的双阈值互斥分流。
 *
 * 第一阈值固定为 72，第二阈值固定为 176。达到第二阈值松手后仅增加请求计数并
 * 打开受控二楼；内容中的关闭按钮通过上下文请求原生执行关闭动画。
 */
export function SecondLevelTestScreen(): React.JSX.Element {
  const refresh = useTestRefresh();
  const [open, setOpen] = useState(false);
  const [requestedCount, setRequestedCount] = useState(0);

  /** 二楼内容保持稳定引用，仅在请求计数变化时更新显示值。 */
  const renderContent = useCallback(
    (context: SecondLevelContentContext) => (
      <View style={styles.secondFloor}>
        <Text style={styles.secondEyebrow}>
          SECOND LEVEL · {requestedCount + 1}
        </Text>
        <Text style={styles.secondTitle}>原生下拉二楼</Text>
        <Text style={styles.secondCopy}>
          当前列表已经移出视口。关闭后由原生动画恢复滚动与刷新手势。
        </Text>
        <Pressable onPress={context.close} style={styles.closeButton}>
          <Text style={styles.closeLabel}>返回主列表</Text>
        </Pressable>
      </View>
    ),
    [requestedCount],
  );

  /** 组合业务受控状态与原生二楼阈值，避免每次渲染创建新配置对象。 */
  const secondLevel = useMemo<SecondLevelOptions>(
    () => ({
      open,
      onOpenChange: setOpen,
      onRequested: () => setRequestedCount((count) => count + 1),
      renderContent,
      threshold: 176,
    }),
    [open, renderContent],
  );

  return (
    <AdvancedShell eyebrow="DUAL THRESHOLD · CONTROLLED" title="下拉二级">
      <View style={styles.thresholdBand}>
        <Text style={styles.thresholdText}>72 刷新</Text>
        <View style={styles.thresholdDivider} />
        <Text style={styles.thresholdText}>176 二楼</Text>
        <View style={styles.thresholdDivider} />
        <Text style={styles.thresholdText}>已触发 {requestedCount} 次</Text>
      </View>
      <RecyclerSecondLevelList
        {...refresh}
        contentContainerStyle={styles.list}
        data={SECOND_ITEMS}
        estimatedItemSize={76}
        keyExtractor={(item) => item.id}
        refreshThreshold={72}
        renderItem={({ item }) => (
          <View style={styles.secondRow}>
            <View style={styles.rowDot} />
            <Text style={styles.cardTitle}>{item.title}</Text>
          </View>
        )}
        secondLevel={secondLevel}
      />
    </AdvancedShell>
  );
}

/** 高级场景外壳属性。 */
type AdvancedShellProps = {
  /** 占满剩余区域的被测列表。 */
  children: React.ReactNode;
  /** 标识当前原生能力的短标签。 */
  eyebrow: string;
  /** 页面主标题。 */
  title: string;
};

/** 为复杂吸顶和下拉二级场景提供一致的安全区与固定标题区域。 */
function AdvancedShell({
  children,
  eyebrow,
  title,
}: AdvancedShellProps): React.JSX.Element {
  return (
    <View style={styles.safeArea}>
      <View style={styles.screenHeader}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.screenTitle}>{title}</Text>
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  cardCopy: { flex: 1, gap: 7 },
  cardDetail: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  cardMarker: { borderRadius: 3, height: 42, width: 5 },
  cardTitle: { color: COLORS.dark, fontSize: 14, fontWeight: '800' },
  closeButton: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 6,
    marginTop: 30,
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  closeLabel: { color: COLORS.dark, fontSize: 14, fontWeight: '800' },
  eyebrow: { color: COLORS.green, fontSize: 10, fontWeight: '900' },
  groupHeader: {
    alignItems: 'center',
    backgroundColor: COLORS.dark,
    borderLeftWidth: 6,
    flexDirection: 'row',
    height: 58,
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  groupTitle: { color: COLORS.surface, fontSize: 17, fontWeight: '900' },
  headerStat: { color: '#c9d7d0', fontSize: 11, fontWeight: '700' },
  headerStats: { flexDirection: 'row', gap: 18, marginTop: 20 },
  heroCopy: {
    color: '#b6c7bf',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
    maxWidth: 330,
  },
  heroTitle: {
    color: COLORS.surface,
    fontSize: 28,
    fontWeight: '900',
    marginTop: 8,
  },
  levelLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '800' },
  list: {
    backgroundColor: COLORS.background,
    paddingBottom: 28,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  rowDot: {
    backgroundColor: COLORS.orange,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  safeArea: { backgroundColor: COLORS.background, flex: 1 },
  screenHeader: {
    backgroundColor: COLORS.surface,
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
    gap: 5,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  screenTitle: { color: COLORS.dark, fontSize: 22, fontWeight: '900' },
  secondCopy: {
    color: '#c9d7d0',
    fontSize: 14,
    lineHeight: 22,
    marginTop: 14,
    maxWidth: 320,
    textAlign: 'center',
  },
  secondEyebrow: { color: '#f2bf57', fontSize: 11, fontWeight: '900' },
  secondFloor: {
    alignItems: 'center',
    backgroundColor: '#163b34',
    flex: 1,
    justifyContent: 'center',
    padding: 28,
  },
  secondRow: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 5,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 68,
    paddingHorizontal: 16,
  },
  secondTitle: {
    color: COLORS.surface,
    fontSize: 29,
    fontWeight: '900',
    marginTop: 10,
  },
  sectionHeader: {
    alignItems: 'center',
    backgroundColor: '#e3ebe6',
    borderLeftWidth: 4,
    flexDirection: 'row',
    height: 46,
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  sectionTitle: { color: COLORS.dark, fontSize: 13, fontWeight: '900' },
  sharedHeader: {
    backgroundColor: COLORS.dark,
    height: 220,
    paddingHorizontal: 22,
    paddingTop: 28,
  },
  stickyContent: {
    backgroundColor: COLORS.surface,
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
    gap: 5,
    minHeight: 78,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  tabCard: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    marginBottom: 10,
    padding: 16,
  },
  thresholdBand: {
    alignItems: 'center',
    backgroundColor: '#e3ebe6',
    flexDirection: 'row',
    minHeight: 42,
    paddingHorizontal: 18,
  },
  thresholdDivider: {
    backgroundColor: '#bac8c0',
    height: 18,
    marginHorizontal: 12,
    width: 1,
  },
  thresholdText: { color: COLORS.dark, fontSize: 11, fontWeight: '800' },
});
