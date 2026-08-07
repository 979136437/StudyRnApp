import { Color } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useColorScheme,
  View,
  type ColorValue,
} from 'react-native';
import {
  PickerView,
  PickerViewColumn,
  type PickerViewEvent,
} from 'react-native-nitro-picker-view';

const START_YEAR = 2024;
const YEAR_COUNT = 80;
const MAX_LOG_ENTRIES = 12;
const STRESS_ITEM_COUNT = 500;
const MAGNIFICATION_OPTIONS = [1, 1.18, 1.35] as const;
const LIGHT_PICKER_BACKGROUND = '#ffffff';
const DARK_PICKER_BACKGROUND = '#1c1c1e';

const YEARS = Array.from(
  { length: YEAR_COUNT },
  (_, index) => `${START_YEAR + index} 年`,
);
const MONTHS = Array.from({ length: 12 }, (_, index) => `${index + 1} 月`);
const STRESS_COLUMNS = [
  Array.from(
    { length: STRESS_ITEM_COUNT },
    (_, index) => `编号 ${String(index + 1).padStart(3, '0')}`,
  ),
  Array.from(
    { length: STRESS_ITEM_COUNT },
    (_, index) => `批次 ${String(index + 1).padStart(3, '0')}`,
  ),
  Array.from(
    { length: STRESS_ITEM_COUNT },
    (_, index) => `位置 ${String(index + 1).padStart(3, '0')}`,
  ),
] as const;

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

interface PickerLogEntry {
  id: number;
  label: string;
  value: readonly number[];
}

function getDayCount(yearIndex: number, monthIndex: number): number {
  const year = START_YEAR + yearIndex;
  return new Date(year, monthIndex + 1, 0).getDate();
}

function formatIndexes(value: readonly number[]): string {
  return value.map((index) => index + 1).join(' / ');
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

export function PickerViewTestScreen(): React.JSX.Element {
  const colorScheme = useColorScheme();
  const pickerBackgroundColor =
    colorScheme === 'dark' ? DARK_PICKER_BACKGROUND : LIGHT_PICKER_BACKGROUND;
  const [disabled, setDisabled] = useState(false);
  const [magnification, setMagnification] = useState<number>(1.18);
  const [dateValue, setDateValue] = useState([2, 1, 14]);
  const [stressValue, setStressValue] = useState([249, 99, 399]);
  const [logs, setLogs] = useState<PickerLogEntry[]>([]);
  const nextLogId = useRef(1);

  const dayCount = getDayCount(dateValue[0] ?? 0, dateValue[1] ?? 0);
  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, index) => `${index + 1} 日`),
    [dayCount],
  );

  const recordEvent = useCallback(
    (label: string, event: PickerViewEvent): void => {
      const entry: PickerLogEntry = {
        id: nextLogId.current++,
        label,
        value: [...event.value],
      };
      setLogs((current) => [entry, ...current].slice(0, MAX_LOG_ENTRIES));
    },
    [],
  );

  const handleDateChange = useCallback(
    (event: PickerViewEvent): void => {
      const nextValue = [...event.value];
      const nextDayCount = getDayCount(nextValue[0] ?? 0, nextValue[1] ?? 0);
      nextValue[2] = Math.min(nextValue[2] ?? 0, nextDayCount - 1);
      setDateValue(nextValue);
      recordEvent('日期 change', { ...event, value: nextValue });
    },
    [recordEvent],
  );

  const handleStressChange = useCallback(
    (event: PickerViewEvent): void => {
      setStressValue([...event.value]);
      recordEvent('压力 change', event);
    },
    [recordEvent],
  );

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        style={styles.screen}
      >
        <View style={styles.section}>
          <SectionHeader
            description="调整禁用状态和中心放大倍率，两个选择器会同步应用配置。"
            title="交互参数"
          />
          <View style={styles.controlRow}>
            <View style={styles.controlCopy}>
              <Text style={styles.controlLabel}>禁用滚动</Text>
              <Text style={styles.controlHint}>仍可响应受控值和列数据更新</Text>
            </View>
            <Switch onValueChange={setDisabled} value={disabled} />
          </View>
          <View
            accessibilityLabel="中心放大倍率"
            accessibilityRole="radiogroup"
            style={styles.segmentedControl}
          >
            {MAGNIFICATION_OPTIONS.map((option) => {
              const selected = magnification === option;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={option}
                  onPress={() => setMagnification(option)}
                  style={[styles.segment, selected && styles.segmentSelected]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      selected && styles.segmentTextSelected,
                    ]}
                  >
                    {option.toFixed(2)}x
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader
            description="切换年份或月份会在吸附完成后重建日期列，用于验证动态列缩短与索引夹取。"
            title="日期联动"
          />
          <View style={styles.pickerFrame}>
            <PickerView
              disabled={disabled}
              edgeFadeColor={pickerBackgroundColor}
              edgeFadeIntensity={0.92}
              edgeFadeSize={76}
              itemHeight={46}
              magnification={magnification}
              onChange={handleDateChange}
              onPickEnd={(event) => recordEvent('日期 pickEnd', event)}
              onPickStart={(event) => recordEvent('日期 pickStart', event)}
              style={[
                styles.picker,
                { backgroundColor: pickerBackgroundColor },
              ]}
              value={dateValue}
            >
              <PickerViewColumn>{YEARS}</PickerViewColumn>
              <PickerViewColumn>{MONTHS}</PickerViewColumn>
              <PickerViewColumn>{days}</PickerViewColumn>
            </PickerView>
          </View>
          <Text selectable style={styles.selectionValue}>
            {YEARS[dateValue[0] ?? 0]} · {MONTHS[dateValue[1] ?? 0]} ·{' '}
            {days[dateValue[2] ?? 0]}
          </Text>
        </View>

        <View style={styles.section}>
          <SectionHeader
            description="三列各 500 项，用于观察快速甩动、行复用、吸附稳定性和回调数量。"
            title="数百项压力测试"
          />
          <View style={styles.pickerFrame}>
            <PickerView
              disabled={disabled}
              edgeFadeColor={pickerBackgroundColor}
              edgeFadeIntensity={0.92}
              edgeFadeSize={76}
              itemHeight={46}
              magnification={magnification}
              onChange={handleStressChange}
              onPickEnd={(event) => recordEvent('压力 pickEnd', event)}
              onPickStart={(event) => recordEvent('压力 pickStart', event)}
              style={[
                styles.picker,
                { backgroundColor: pickerBackgroundColor },
              ]}
              value={stressValue}
            >
              {STRESS_COLUMNS.map((items, index) => (
                <PickerViewColumn key={index}>{items}</PickerViewColumn>
              ))}
            </PickerView>
          </View>
          <Text selectable style={styles.selectionValue}>
            当前索引：{formatIndexes(stressValue)}
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.logHeader}>
            <SectionHeader
              description="验证每次手势只产生一次开始、变更和结束事件。"
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
                  <Text selectable style={styles.logLabel}>
                    {entry.label}
                  </Text>
                  <Text selectable style={styles.logValue}>
                    {formatIndexes(entry.value)}
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
  buttonPressed: { opacity: 0.6 },
  clearButton: {
    alignItems: 'center',
    borderColor: COLORS.border,
    borderCurve: 'continuous',
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
  emptyText: {
    color: COLORS.muted,
    fontSize: 14,
    paddingVertical: 20,
    textAlign: 'center',
  },
  logHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
  },
  logLabel: { color: COLORS.text, flex: 1, fontSize: 14, fontWeight: '600' },
  logList: {
    borderTopColor: COLORS.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  logRow: {
    alignItems: 'center',
    borderBottomColor: COLORS.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 48,
    paddingVertical: 8,
  },
  logValue: {
    color: COLORS.muted,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  picker: { flex: 1 },
  pickerFrame: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderCurve: 'continuous',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 230,
    overflow: 'hidden',
  },
  screen: { backgroundColor: COLORS.background },
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
  selectionValue: {
    color: COLORS.text,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    textAlign: 'center',
  },
});
