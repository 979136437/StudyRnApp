import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  RecyclerGroupedStickyList,
  RecyclerList,
  RecyclerSecondLevelList,
  RecyclerTabView,
  type RecyclerTabItem,
  type SecondLevelContentContext,
  type SecondLevelOptions,
} from 'react-native-nitro-recycler-list';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTestRefresh } from './recycler-list-test-screens';

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

type DemoTab = RecyclerTabItem & { accent: string };
type TabCard = { id: string; title: string; detail: string; height: number };

const TABS: readonly DemoTab[] = [
  { key: 'selected', title: '精选', accent: COLORS.green },
  { key: 'latest', title: '最新', accent: COLORS.orange },
  { key: 'saved', title: '收藏', accent: COLORS.yellow },
];

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
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
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
    </SafeAreaView>
  );
}

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

type SecondItem = { id: string; title: string };
const SECOND_ITEMS: SecondItem[] = Array.from({ length: 32 }, (_, index) => ({
  id: `second-${index}`,
  title: `主列表内容 ${String(index + 1).padStart(2, '0')}`,
}));

export function SecondLevelTestScreen(): React.JSX.Element {
  const refresh = useTestRefresh();
  const [open, setOpen] = useState(false);
  const [requestedCount, setRequestedCount] = useState(0);
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

function AdvancedShell({
  children,
  eyebrow,
  title,
}: {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
}): React.JSX.Element {
  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <View style={styles.screenHeader}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.screenTitle}>{title}</Text>
      </View>
      <View style={styles.body}>{children}</View>
    </SafeAreaView>
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
