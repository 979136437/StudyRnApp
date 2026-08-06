import { Color, Link, Stack } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
  type ColorValue,
} from 'react-native';
import {
  VisibilityObserver,
  type VisibilityChangeEvent,
} from 'react-native-nitro-visibility-observer';

const THRESHOLD_OPTIONS = [0.25, 0.5, 0.75] as const;
const MAX_LOG_ENTRIES = 20;

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
  negative: Platform.select<ColorValue>({
    android: Color.android.dynamic.error,
    default: '#c62828',
    ios: Color.ios.systemRed,
  }),
  positive: Platform.select<ColorValue>({
    android: Color.android.dynamic.primary,
    default: '#198754',
    ios: Color.ios.systemGreen,
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

interface VisibilityLogEntry extends VisibilityChangeEvent {
  id: number;
  source: string;
  time: string;
}

interface ObservedPanelProps {
  enabled: boolean;
  label: string;
  minimumVisibleDurationMs: number;
  onChange: (source: string, event: VisibilityChangeEvent) => void;
  state?: VisibilityChangeEvent;
  threshold: number;
}

function ObservedPanel({
  enabled,
  label,
  minimumVisibleDurationMs,
  onChange,
  state,
  threshold,
}: ObservedPanelProps): React.JSX.Element {
  const handleChange = useCallback(
    (event: VisibilityChangeEvent) => onChange(label, event),
    [label, onChange],
  );
  const isVisible = state?.isVisible ?? false;

  return (
    <VisibilityObserver
      enabled={enabled}
      minimumVisibleDurationMs={minimumVisibleDurationMs}
      onVisibilityChange={handleChange}
      style={styles.observedPanel}
      threshold={threshold}
    >
      <View style={styles.panelHeader}>
        <Text selectable style={styles.panelTitle}>
          {label}
        </Text>
        <View
          accessibilityLabel={isVisible ? '当前可见' : '当前不可见'}
          style={[
            styles.statusDot,
            { backgroundColor: isVisible ? COLORS.positive : COLORS.negative },
          ]}
        />
      </View>
      <Text selectable style={styles.panelValue}>
        {state === undefined
          ? '等待首次原生测量'
          : `${isVisible ? '可见' : '不可见'} · ${(state.visibleRatio * 100).toFixed(0)}%`}
      </Text>
    </VisibilityObserver>
  );
}

function SectionHeader({
  description,
  title,
}: {
  description: string;
  title: string;
}): React.JSX.Element {
  return (
    <View style={styles.sectionHeader}>
      <Text selectable style={styles.sectionTitle}>
        {title}
      </Text>
      <Text selectable style={styles.sectionDescription}>
        {description}
      </Text>
    </View>
  );
}

export function VisibilityObserverTestScreen(): React.JSX.Element {
  useColorScheme();
  const { width } = useWindowDimensions();
  const pageWidth = Math.min(420, Math.max(240, width - 64));
  const [enabled, setEnabled] = useState(true);
  const [delayed, setDelayed] = useState(false);
  const [threshold, setThreshold] = useState<number>(0.5);
  const [states, setStates] = useState<
    Record<string, VisibilityChangeEvent | undefined>
  >({});
  const [logs, setLogs] = useState<VisibilityLogEntry[]>([]);
  const nextLogId = useRef(1);
  const minimumVisibleDurationMs = delayed ? 600 : 0;

  const recordVisibility = useCallback(
    (source: string, event: VisibilityChangeEvent): void => {
      setStates((current) => ({ ...current, [source]: event }));
      setLogs((current) => {
        // 限制测试日志长度，避免高频来回滚动时状态持续增长。
        const nextEntry: VisibilityLogEntry = {
          ...event,
          id: nextLogId.current++,
          source,
          time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        };
        return [nextEntry, ...current].slice(0, MAX_LOG_ENTRIES);
      });
    },
    [],
  );

  const commonPanelProps = useMemo(
    () => ({ enabled, minimumVisibleDurationMs, threshold }),
    [enabled, minimumVisibleDurationMs, threshold],
  );

  return (
    <>
      <Stack.Title>可见性监听测试</Stack.Title>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        style={styles.screen}
      >
        <View style={styles.section}>
          <SectionHeader
            description="调整参数后，所有观察区域会使用相同配置。"
            title="检测参数"
          />
          <View style={styles.controlRow}>
            <View style={styles.controlCopy}>
              <Text style={styles.controlLabel}>启用监听</Text>
              <Text style={styles.controlHint}>关闭后立即报告不可见</Text>
            </View>
            <Switch onValueChange={setEnabled} value={enabled} />
          </View>
          <View style={styles.controlRow}>
            <View style={styles.controlCopy}>
              <Text style={styles.controlLabel}>延迟进入</Text>
              <Text style={styles.controlHint}>连续可见 600 毫秒后生效</Text>
            </View>
            <Switch onValueChange={setDelayed} value={delayed} />
          </View>
          <View style={styles.segmentedControl}>
            {THRESHOLD_OPTIONS.map((option) => {
              const selected = threshold === option;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={option}
                  onPress={() => setThreshold(option)}
                  style={[styles.segment, selected && styles.segmentSelected]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      selected && styles.segmentTextSelected,
                    ]}
                  >
                    {option * 100}%
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader
            description="向下滚动，让区域逐步离开窗口，观察比例跨过阈值时的事件。"
            title="纵向滚动"
          />
          <ObservedPanel
            {...commonPanelProps}
            label="顶部观察区"
            onChange={recordVisibility}
            state={states['顶部观察区']}
          />
          <View style={styles.scrollDistance}>
            <Text selectable style={styles.distanceLabel}>
              继续向下滚动
            </Text>
          </View>
          <ObservedPanel
            {...commonPanelProps}
            label="底部观察区"
            onChange={recordVisibility}
            state={states['底部观察区']}
          />
        </View>

        <View style={styles.section}>
          <SectionHeader
            description="横向滑动分页，离开裁剪区域的页面应报告不可见。"
            title="轮播区域"
          />
          <ScrollView
            contentContainerStyle={styles.carouselContent}
            decelerationRate="fast"
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={pageWidth + 12}
          >
            {['轮播第一页', '轮播第二页', '轮播第三页'].map((label) => (
              <View key={label} style={{ width: pageWidth }}>
                <ObservedPanel
                  {...commonPanelProps}
                  label={label}
                  onChange={recordVisibility}
                  state={states[label]}
                />
              </View>
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <SectionHeader
            description="进入缓存页后返回，查看下方日志是否记录失焦期间的状态变化。"
            title="页面跳转"
          />
          <ObservedPanel
            {...commonPanelProps}
            label="页面跳转观察区"
            onChange={recordVisibility}
            state={states['页面跳转观察区']}
          />
          <Link href="/cache" asChild>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.navigationButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.navigationButtonText}>打开缓存统计页</Text>
            </Pressable>
          </Link>
        </View>

        <View style={styles.section}>
          <View style={styles.logHeader}>
            <SectionHeader
              description="仅保留最近 20 条首次测量和阈值变化事件。"
              title="事件记录"
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => setLogs([])}
              style={({ pressed }) => [
                styles.clearButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.clearButtonText}>清空</Text>
            </Pressable>
          </View>
          {logs.length === 0 ? (
            <Text selectable style={styles.emptyText}>
              暂无事件
            </Text>
          ) : (
            <View style={styles.logList}>
              {logs.map((entry) => (
                <View key={entry.id} style={styles.logRow}>
                  <View style={styles.logCopy}>
                    <Text selectable style={styles.logSource}>
                      {entry.source}
                    </Text>
                    <Text selectable style={styles.logMeta}>
                      {entry.time} · {(entry.visibleRatio * 100).toFixed(0)}%
                    </Text>
                  </View>
                  <Text
                    selectable
                    style={[
                      styles.logState,
                      {
                        color: entry.isVisible
                          ? COLORS.positive
                          : COLORS.negative,
                      },
                    ]}
                  >
                    {entry.isVisible ? '可见' : '不可见'}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  buttonPressed: { opacity: 0.65 },
  carouselContent: { gap: 12, paddingRight: 16 },
  clearButton: {
    alignItems: 'center',
    borderColor: COLORS.border,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  clearButtonText: { color: COLORS.accent, fontSize: 14, fontWeight: '600' },
  content: { gap: 32, padding: 16, paddingBottom: 48 },
  controlCopy: { flex: 1, gap: 3 },
  controlHint: { color: COLORS.muted, fontSize: 13 },
  controlLabel: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  controlRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    minHeight: 52,
  },
  distanceLabel: { color: COLORS.muted, fontSize: 13 },
  emptyText: {
    color: COLORS.muted,
    fontSize: 14,
    paddingVertical: 20,
    textAlign: 'center',
  },
  logCopy: { flex: 1, gap: 2 },
  logHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
  },
  logList: {
    borderTopColor: COLORS.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  logMeta: {
    color: COLORS.muted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  logRow: {
    alignItems: 'center',
    borderBottomColor: COLORS.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 56,
    paddingVertical: 8,
  },
  logSource: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  logState: { fontSize: 13, fontWeight: '700' },
  navigationButton: {
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    borderCurve: 'continuous',
    borderRadius: 6,
    height: 46,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  navigationButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  observedPanel: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderCurve: 'continuous',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    minHeight: 148,
    padding: 18,
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  panelTitle: {
    color: COLORS.text,
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
  },
  panelValue: {
    color: COLORS.muted,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  screen: { backgroundColor: COLORS.background },
  scrollDistance: {
    alignItems: 'center',
    height: 520,
    justifyContent: 'center',
  },
  section: { gap: 16 },
  sectionDescription: { color: COLORS.muted, fontSize: 14, lineHeight: 20 },
  sectionHeader: { flex: 1, gap: 5 },
  sectionTitle: { color: COLORS.text, fontSize: 19, fontWeight: '700' },
  segment: {
    alignItems: 'center',
    borderRadius: 5,
    flex: 1,
    height: 34,
    justifyContent: 'center',
  },
  segmentSelected: {
    backgroundColor: COLORS.surface,
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.12)',
  },
  segmentedControl: {
    backgroundColor: COLORS.border,
    borderCurve: 'continuous',
    borderRadius: 7,
    flexDirection: 'row',
    gap: 2,
    padding: 2,
  },
  segmentText: { color: COLORS.muted, fontSize: 13, fontWeight: '600' },
  segmentTextSelected: { color: COLORS.text },
  statusDot: { borderRadius: 6, height: 12, width: 12 },
});
