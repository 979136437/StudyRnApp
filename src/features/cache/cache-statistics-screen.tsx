import { Color, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Switch,
  Text,
  useColorScheme,
  View,
  type ColorValue,
} from 'react-native';
import {
  useMediaCache,
  type MediaCacheEntryInfo,
  type MediaCacheKind,
  type MediaCacheRemovalResult,
  type MediaCacheStats,
} from 'react-native-components';

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
const DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

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
  danger: Platform.select<ColorValue>({
    android: Color.android.dynamic.error,
    default: '#c62828',
    ios: Color.ios.systemRed,
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

interface CacheSection {
  data: MediaCacheEntryInfo[];
  kind: MediaCacheKind;
  title: string;
}

function formatBytes(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return '0 B';
  }

  const unitIndex = Math.min(
    Math.floor(Math.log(sizeBytes) / Math.log(1024)),
    BYTE_UNITS.length - 1,
  );
  const value = sizeBytes / 1024 ** unitIndex;
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${BYTE_UNITS[unitIndex]}`;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? '未知时间'
    : DATE_FORMATTER.format(date);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '缓存数据读取失败';
}

function describeRemoval(result: MediaCacheRemovalResult): string {
  const base = `已清除 ${result.removedCount} 项，共 ${formatBytes(result.removedSizeBytes)}`;
  return result.deferredCount > 0
    ? `${base}；${result.deferredCount} 项将在停止使用后删除`
    : base;
}

function StatItem({
  count,
  label,
  sizeBytes,
}: {
  count: number;
  label: string;
  sizeBytes: number;
}): React.JSX.Element {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text selectable style={styles.statValue}>
        {formatBytes(sizeBytes)}
      </Text>
      <Text selectable style={styles.statDetail}>
        {count} 项
      </Text>
    </View>
  );
}

export function CacheStatisticsScreen(): React.JSX.Element {
  useColorScheme();
  const { clear, enabled, getEntries, getStats, remove, setEnabled } =
    useMediaCache();
  const [entries, setEntries] = useState<MediaCacheEntryInfo[]>([]);
  const [stats, setStats] = useState<MediaCacheStats | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const loadCacheData = useCallback(
    async (showRefreshIndicator = false): Promise<void> => {
      if (showRefreshIndicator) {
        setIsRefreshing(true);
      }
      setErrorMessage(null);

      try {
        // 并行读取明细与汇总，避免缓存较多时串行等待两次文件校验。
        const [nextEntries, nextStats] = await Promise.all([
          getEntries(),
          getStats(),
        ]);
        setEntries(nextEntries);
        setStats(nextStats);
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setIsRefreshing(false);
      }
    },
    [getEntries, getStats],
  );

  useFocusEffect(
    useCallback(() => {
      void loadCacheData();
    }, [loadCacheData]),
  );

  const sections = useMemo<CacheSection[]>(
    () => [
      {
        data: entries.filter((entry) => entry.kind === 'image'),
        kind: 'image',
        title: '图片缓存',
      },
      {
        data: entries.filter((entry) => entry.kind === 'video'),
        kind: 'video',
        title: '视频缓存',
      },
    ],
    [entries],
  );

  const runRemoval = useCallback(
    async (
      actionId: string,
      action: () => Promise<MediaCacheRemovalResult>,
    ): Promise<void> => {
      setPendingAction(actionId);
      setErrorMessage(null);
      setResultMessage(null);
      try {
        const result = await action();
        setResultMessage(describeRemoval(result));
        await loadCacheData();
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setPendingAction(null);
      }
    },
    [loadCacheData],
  );

  const confirmRemoveEntry = useCallback(
    (entry: MediaCacheEntryInfo): void => {
      Alert.alert('清除这项缓存？', formatBytes(entry.sizeBytes), [
        { style: 'cancel', text: '取消' },
        {
          onPress: () => {
            void runRemoval(`entry:${entry.id}`, () => remove(entry.id));
          },
          style: 'destructive',
          text: '清除',
        },
      ]);
    },
    [remove, runRemoval],
  );

  const confirmClear = useCallback(
    (kind?: MediaCacheKind): void => {
      const label =
        kind === 'image' ? '图片' : kind === 'video' ? '视频' : '全部';
      Alert.alert(`清除${label}缓存？`, '正在使用的文件会在释放后删除。', [
        { style: 'cancel', text: '取消' },
        {
          onPress: () => {
            void runRemoval(`clear:${kind ?? 'all'}`, () => clear(kind));
          },
          style: 'destructive',
          text: '清除',
        },
      ]);
    },
    [clear, runRemoval],
  );

  const renderEntry = useCallback(
    ({ item }: { item: MediaCacheEntryInfo }): React.JSX.Element => {
      const actionId = `entry:${item.id}`;
      const isPending = pendingAction === actionId;
      return (
        <View style={styles.entry}>
          <View style={styles.entryHeader}>
            <Text selectable numberOfLines={1} style={styles.entryId}>
              {item.id}
            </Text>
            {item.expired ? (
              <Text style={styles.expiredText}>已过期</Text>
            ) : null}
          </View>
          <Text selectable style={styles.entryMeta}>
            {formatBytes(item.sizeBytes)} · 最近访问{' '}
            {formatDate(item.lastAccessedAt)}
          </Text>
          <Pressable
            accessibilityLabel={`清除缓存 ${item.id}`}
            accessibilityRole="button"
            accessibilityState={{ disabled: pendingAction !== null }}
            disabled={pendingAction !== null}
            onPress={() => confirmRemoveEntry(item)}
            style={({ pressed }) => [
              styles.removeButton,
              pressed && styles.buttonPressed,
            ]}
          >
            {isPending ? (
              <ActivityIndicator color={COLORS.danger} size="small" />
            ) : (
              <Text style={styles.removeButtonText}>清除</Text>
            )}
          </Pressable>
        </View>
      );
    },
    [confirmRemoveEntry, pendingAction],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: CacheSection }): React.JSX.Element => {
      const isPending = pendingAction === `clear:${section.kind}`;
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {section.title}（{section.data.length}）
          </Text>
          <Pressable
            accessibilityLabel={`清除全部${section.title}`}
            accessibilityRole="button"
            accessibilityState={{
              disabled: pendingAction !== null || section.data.length === 0,
            }}
            disabled={pendingAction !== null || section.data.length === 0}
            onPress={() => confirmClear(section.kind)}
            style={({ pressed }) => [
              styles.sectionAction,
              (pendingAction !== null || section.data.length === 0) &&
                styles.disabled,
              pressed && styles.buttonPressed,
            ]}
          >
            {isPending ? (
              <ActivityIndicator color={COLORS.danger} size="small" />
            ) : (
              <Text style={styles.sectionActionText}>全部清除</Text>
            )}
          </Pressable>
        </View>
      );
    },
    [confirmClear, pendingAction],
  );

  const listHeader = (
    <View style={styles.headerContent}>
      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchTitle}>全局媒体缓存</Text>
          <Text style={styles.switchStatus}>
            {enabled ? '已开启' : '已关闭'}
          </Text>
        </View>
        <Switch
          accessibilityLabel="全局媒体缓存"
          onValueChange={(nextEnabled) => {
            setEnabled(nextEnabled);
            setResultMessage(nextEnabled ? '缓存已开启' : '缓存已关闭');
          }}
          value={enabled}
        />
      </View>

      <Text style={styles.overviewTitle}>缓存概览</Text>
      {stats ? (
        <View style={styles.statsGrid}>
          <StatItem
            count={stats.totalCount}
            label="全部"
            sizeBytes={stats.totalSizeBytes}
          />
          <StatItem
            count={stats.image.count}
            label="图片"
            sizeBytes={stats.image.sizeBytes}
          />
          <StatItem
            count={stats.video.count}
            label="视频"
            sizeBytes={stats.video.sizeBytes}
          />
        </View>
      ) : (
        <ActivityIndicator color={COLORS.accent} style={styles.loading} />
      )}

      {errorMessage ? (
        <Text accessibilityRole="alert" selectable style={styles.errorText}>
          {errorMessage}
        </Text>
      ) : null}
      {resultMessage ? (
        <Text accessibilityRole="summary" selectable style={styles.resultText}>
          {resultMessage}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{
          disabled: pendingAction !== null || entries.length === 0,
        }}
        disabled={pendingAction !== null || entries.length === 0}
        onPress={() => confirmClear()}
        style={({ pressed }) => [
          styles.clearAllButton,
          (pendingAction !== null || entries.length === 0) && styles.disabled,
          pressed && styles.buttonPressed,
        ]}
      >
        {pendingAction === 'clear:all' ? (
          <ActivityIndicator color={COLORS.danger} size="small" />
        ) : (
          <Text style={styles.clearAllButtonText}>清除全部缓存</Text>
        )}
      </Pressable>
    </View>
  );

  return (
    <>
      <Stack.Title>缓存统计</Stack.Title>
      <SectionList<MediaCacheEntryInfo, CacheSection>
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        refreshControl={
          <RefreshControl
            onRefresh={() => void loadCacheData(true)}
            refreshing={isRefreshing}
            tintColor={COLORS.accent}
          />
        }
        renderItem={renderEntry}
        renderSectionHeader={renderSectionHeader}
        sections={sections}
        stickySectionHeadersEnabled={false}
        style={styles.screen}
      />
    </>
  );
}

const styles = StyleSheet.create({
  buttonPressed: {
    opacity: 0.55,
  },
  clearAllButton: {
    alignItems: 'center',
    borderColor: COLORS.danger,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    marginTop: 16,
  },
  clearAllButtonText: {
    color: COLORS.danger,
    fontSize: 15,
    fontWeight: '600',
  },
  content: {
    paddingBottom: 32,
  },
  disabled: {
    opacity: 0.4,
  },
  entry: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
    marginHorizontal: 16,
    padding: 14,
  },
  entryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  entryId: {
    color: COLORS.text,
    flex: 1,
    fontFamily: Platform.select({
      android: 'monospace',
      default: undefined,
      ios: 'Menlo',
    }),
    fontSize: 13,
  },
  entryMeta: {
    color: COLORS.muted,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    lineHeight: 19,
    marginTop: 8,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
  },
  expiredText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  headerContent: {
    padding: 16,
  },
  loading: {
    height: 92,
  },
  overviewTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 10,
    marginTop: 24,
  },
  removeButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    height: 32,
    justifyContent: 'center',
    marginTop: 8,
    minWidth: 48,
  },
  removeButtonText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: '600',
  },
  resultText: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
  },
  screen: {
    backgroundColor: COLORS.background,
    flex: 1,
  },
  sectionAction: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    minWidth: 72,
  },
  sectionActionText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  statDetail: {
    color: COLORS.muted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
  statItem: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: 100,
    flexGrow: 1,
    minHeight: 92,
    padding: 12,
  },
  statLabel: {
    color: COLORS.muted,
    fontSize: 12,
  },
  statValue: {
    color: COLORS.text,
    fontSize: 18,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    marginTop: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  switchCopy: {
    flex: 1,
    paddingRight: 16,
  },
  switchRow: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  switchStatus: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 3,
  },
  switchTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
});
