import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  RefreshControl,
  RefreshPhase,
  RefreshResult,
  type RefreshControlRef,
  type RefreshHeaderContext,
  type RefreshStateSnapshot,
} from 'react-native-nitro-refresh';
import Animated, {
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

type ActivityItem = {
  id: number;
  title: string;
  category: string;
  time: string;
  accent: string;
};

const BASE_ITEMS: ActivityItem[] = [
  {
    id: 1,
    title: '移动端交互评审',
    category: '设计',
    time: '09:30',
    accent: '#e05a47',
  },
  {
    id: 2,
    title: 'Fabric 组件联调',
    category: '原生',
    time: '10:45',
    accent: '#147d64',
  },
  {
    id: 3,
    title: '列表性能采样',
    category: '性能',
    time: '13:20',
    accent: '#d99a27',
  },
  {
    id: 4,
    title: '刷新状态验收',
    category: '测试',
    time: '15:10',
    accent: '#4966a8',
  },
  {
    id: 5,
    title: 'iOS 安全区校准',
    category: '适配',
    time: '16:00',
    accent: '#8c5d9f',
  },
  {
    id: 6,
    title: 'Android 手势回归',
    category: '适配',
    time: '17:30',
    accent: '#315f74',
  },
  {
    id: 7,
    title: '开发构建归档',
    category: '交付',
    time: '18:20',
    accent: '#785c48',
  },
  {
    id: 8,
    title: '开发构建归档',
    category: '交付',
    time: '18:20',
    accent: '#785c48',
  },
  {
    id: 9,
    title: '开发构建归档',
    category: '交付',
    time: '18:20',
    accent: '#785c48',
  },
  {
    id: 10,
    title: '开发构建归档',
    category: '交付',
    time: '18:20',
    accent: '#785c48',
  },
];

const PHASE_LABEL: Record<RefreshPhase, string> = {
  [RefreshPhase.IDLE]: '下拉同步',
  [RefreshPhase.PULLING]: '继续下拉',
  [RefreshPhase.READY]: '松开同步',
  [RefreshPhase.REFRESHING]: '同步中',
  [RefreshPhase.SUCCESS]: '同步成功',
  [RefreshPhase.FAILURE]: '同步失败',
  [RefreshPhase.SETTLING]: '已同步',
};

type CommandTone = 'neutral' | 'primary' | 'success' | 'failure';

function CommandButton({
  disabled = false,
  label,
  onPress,
  tone = 'neutral',
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  tone?: CommandTone;
}): React.JSX.Element {
  const toneStyle =
    tone === 'primary'
      ? styles.commandPrimary
      : tone === 'success'
        ? styles.commandSuccess
        : tone === 'failure'
          ? styles.commandFailure
          : styles.commandNeutral;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.commandButton,
        toneStyle,
        pressed && !disabled && styles.commandPressed,
        disabled && styles.commandDisabled,
      ]}
    >
      <Text style={styles.commandLabel}>{label}</Text>
    </Pressable>
  );
}

const ActivityRow = memo(function ActivityRow({
  item,
}: {
  item: ActivityItem;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <View style={[styles.accent, { backgroundColor: item.accent }]} />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{item.title}</Text>
        <Text style={styles.rowMeta}>{item.category}</Text>
      </View>
      <Text style={styles.rowTime}>{item.time}</Text>
    </View>
  );
});

function DemoRefreshHeader({
  phase,
  offset,
  progress,
}: RefreshHeaderContext): React.JSX.Element {
  const dialStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.2, 1], [0, 0.45, 1]),
    transform: [
      { rotate: `${progress.value * 270}deg` },
      { scale: interpolate(progress.value, [0, 1], [0.72, 1]) },
    ],
  }));
  const lineStyle = useAnimatedStyle(() => ({
    width: Math.max(12, offset.value * 0.48),
  }));

  return (
    <View style={styles.refreshHeader}>
      <Animated.View style={[styles.refreshDial, dialStyle]}>
        <View style={styles.refreshDialCore} />
      </Animated.View>
      <View style={styles.refreshCopy}>
        <Text style={styles.refreshLabel}>{PHASE_LABEL[phase]}</Text>
        <Animated.View style={[styles.refreshLine, lineStyle]} />
      </View>
    </View>
  );
}

export default function Home(): React.JSX.Element {
  const refreshControlRef = useRef<RefreshControlRef>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [snapshot, setSnapshot] = useState<RefreshStateSnapshot>({
    offset: 0,
    phase: RefreshPhase.IDLE,
    refreshing: false,
  });

  const data = useMemo(
    () =>
      BASE_ITEMS.map((item, index) => ({
        ...item,
        time:
          refreshCount === 0
            ? item.time
            : `${String(9 + ((index + refreshCount) % 10)).padStart(2, '0')}:${String((index * 11 + refreshCount * 7) % 60).padStart(2, '0')}`,
      })),
    [refreshCount],
  );

  const clearPendingRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const readSnapshot = useCallback(() => {
    const nextSnapshot = refreshControlRef.current?.getState();
    if (nextSnapshot !== undefined) {
      setSnapshot(nextSnapshot);
    }
  }, []);

  const finishRefresh = useCallback(
    (result: RefreshResult) => {
      clearPendingRefresh();
      refreshControlRef.current?.finishRefresh(result);
      if (result === RefreshResult.SUCCESS) {
        setRefreshCount((count) => count + 1);
      }
      setRefreshing(false);
    },
    [clearPendingRefresh],
  );

  const onRefresh = useCallback(() => {
    clearPendingRefresh();
    setRefreshing(true);
    refreshTimerRef.current = setTimeout(() => {
      finishRefresh(RefreshResult.SUCCESS);
    }, 5600);
  }, [clearPendingRefresh, finishRefresh]);

  const cancelRefresh = useCallback(() => {
    clearPendingRefresh();
    refreshControlRef.current?.cancelRefresh();
    setRefreshing(false);
  }, [clearPendingRefresh]);

  const onStateChange = useCallback(
    (_phase: RefreshPhase) => {
      readSnapshot();
    },
    [readSnapshot],
  );

  useEffect(() => clearPendingRefresh, [clearPendingRefresh]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ActivityItem>) => <ActivityRow item={item} />,
    [],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.eyebrow}>NITRO REFRESH</Text>
          <Text style={styles.title}>今日工作流</Text>
        </View>
        <View style={styles.syncBadge}>
          <View style={styles.syncDot} />
          <Text style={styles.syncText}>#{refreshCount + 1}</Text>
        </View>
      </View>

      <View style={styles.summaryBand}>
        <View>
          <Text style={styles.summaryNumber}>{data.length}</Text>
          <Text style={styles.summaryLabel}>待处理节点</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryWide}>
          <Text style={styles.summaryCaption}>最近同步</Text>
          <Text style={styles.summaryValue}>
            {refreshCount === 0 ? '尚未同步' : `已完成 ${refreshCount} 次`}
          </Text>
        </View>
      </View>

      <View style={styles.commandBand}>
        <View style={styles.commandHeadingRow}>
          <Text style={styles.commandTitle}>命令控制</Text>
          <Text style={styles.commandHint}>Nitro 同步通道</Text>
        </View>
        <View style={styles.commandGrid}>
          <CommandButton
            disabled={refreshing || snapshot.phase === RefreshPhase.PULLING}
            label="开始刷新"
            onPress={() => refreshControlRef.current?.beginRefresh()}
            tone="primary"
          />
          <CommandButton
            disabled={snapshot.phase !== RefreshPhase.IDLE}
            label="拉至最大"
            onPress={() => refreshControlRef.current?.pullToMax()}
          />
          <CommandButton
            disabled={!refreshing && snapshot.phase === RefreshPhase.IDLE}
            label="取消"
            onPress={cancelRefresh}
          />
          <CommandButton
            disabled={!refreshing}
            label="成功结束"
            onPress={() => finishRefresh(RefreshResult.SUCCESS)}
            tone="success"
          />
          <CommandButton
            disabled={!refreshing}
            label="失败结束"
            onPress={() => finishRefresh(RefreshResult.FAILURE)}
            tone="failure"
          />
          <CommandButton label="读取状态" onPress={readSnapshot} />
        </View>
      </View>

      <View style={styles.snapshotBand}>
        <View style={styles.snapshotItem}>
          <Text style={styles.snapshotLabel}>阶段</Text>
          <Text selectable style={styles.snapshotValue}>
            {PHASE_LABEL[snapshot.phase]}
          </Text>
        </View>
        <View style={styles.snapshotDivider} />
        <View style={styles.snapshotItem}>
          <Text style={styles.snapshotLabel}>偏移</Text>
          <Text selectable style={styles.snapshotValue}>
            {snapshot.offset.toFixed(1)}
          </Text>
        </View>
        <View style={styles.snapshotDivider} />
        <View style={styles.snapshotItem}>
          <Text style={styles.snapshotLabel}>刷新</Text>
          <Text selectable style={styles.snapshotValue}>
            {snapshot.refreshing ? '是' : '否'}
          </Text>
        </View>
      </View>

      <FlashList
        style={styles.list}
        data={data}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={Separator}
        refreshControl={
          <RefreshControl
            ref={refreshControlRef}
            refreshing={refreshing}
            onRefresh={onRefresh}
            onStateChange={onStateChange}
            pullDistance={46}
            maxPullDistance={176}
            resultDuration={800}
            renderHeader={(context) => <DemoRefreshHeader {...context} />}
          />
        }
      />
    </SafeAreaView>
  );
}

function Separator(): React.JSX.Element {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  accent: {
    borderRadius: 2,
    height: 34,
    width: 4,
  },
  commandBand: {
    backgroundColor: '#ffffff',
    borderBottomColor: '#dfe3de',
    borderBottomWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  commandButton: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 5,
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 8,
  },
  commandDisabled: {
    opacity: 0.38,
  },
  commandFailure: {
    backgroundColor: '#c84f45',
  },
  commandGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  commandHeadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  commandHint: {
    color: '#708078',
    fontSize: 11,
  },
  commandLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  commandNeutral: {
    backgroundColor: '#4f615a',
  },
  commandPressed: {
    opacity: 0.72,
  },
  commandPrimary: {
    backgroundColor: '#315f74',
  },
  commandSuccess: {
    backgroundColor: '#147d64',
  },
  commandTitle: {
    color: '#17211e',
    fontSize: 13,
    fontWeight: '800',
  },
  eyebrow: {
    color: '#147d64',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  listContent: {
    paddingBottom: 28,
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  list: {
    backgroundColor: '#f3f5f1',
    flex: 1,
  },
  refreshCopy: {
    gap: 6,
    minWidth: 82,
  },
  refreshDial: {
    alignItems: 'center',
    borderColor: '#147d64',
    borderRadius: 19,
    borderRightColor: '#e05a47',
    borderWidth: 3,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  refreshDialCore: {
    backgroundColor: '#16211e',
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  refreshHeader: {
    alignItems: 'center',
    backgroundColor: '#dce9e2',
    flex: 1,
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'center',
  },
  refreshLabel: {
    color: '#16211e',
    fontSize: 13,
    fontWeight: '700',
  },
  refreshLine: {
    backgroundColor: '#e05a47',
    borderRadius: 2,
    height: 3,
    maxWidth: 72,
  },
  row: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#dfe3de',
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 70,
    paddingHorizontal: 16,
  },
  rowBody: {
    flex: 1,
    gap: 4,
    marginLeft: 14,
  },
  rowMeta: {
    color: '#708078',
    fontSize: 12,
  },
  rowTime: {
    color: '#31433d',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  rowTitle: {
    color: '#17211e',
    fontSize: 15,
    fontWeight: '700',
  },
  safeArea: {
    backgroundColor: '#f3f5f1',
    flex: 1,
  },
  separator: {
    height: 10,
  },
  snapshotBand: {
    alignItems: 'center',
    backgroundColor: '#e7ece8',
    flexDirection: 'row',
    minHeight: 50,
    paddingHorizontal: 18,
  },
  snapshotDivider: {
    backgroundColor: '#cbd4cf',
    height: 24,
    width: 1,
  },
  snapshotItem: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
  },
  snapshotLabel: {
    color: '#708078',
    fontSize: 10,
  },
  snapshotValue: {
    color: '#24332e',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  summaryBand: {
    alignItems: 'center',
    backgroundColor: '#17211e',
    flexDirection: 'row',
    minHeight: 88,
    paddingHorizontal: 22,
  },
  summaryCaption: {
    color: '#9fb1a9',
    fontSize: 11,
  },
  summaryDivider: {
    backgroundColor: '#40504a',
    height: 42,
    marginHorizontal: 22,
    width: 1,
  },
  summaryLabel: {
    color: '#9fb1a9',
    fontSize: 11,
  },
  summaryNumber: {
    color: '#ffffff',
    fontSize: 28,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  summaryValue: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  summaryWide: {
    flex: 1,
  },
  syncBadge: {
    alignItems: 'center',
    backgroundColor: '#e7ece8',
    borderRadius: 5,
    flexDirection: 'row',
    gap: 7,
    minHeight: 34,
    paddingHorizontal: 11,
  },
  syncDot: {
    backgroundColor: '#e05a47',
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  syncText: {
    color: '#24332e',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  title: {
    color: '#17211e',
    fontSize: 25,
    fontWeight: '800',
    marginTop: 3,
  },
  topBar: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 88,
    paddingHorizontal: 22,
  },
});
