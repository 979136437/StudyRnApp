import { Color, Stack } from 'expo-router';
import { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type ColorValue,
} from 'react-native';
import {
  height,
  rpx,
  useResponsiveUpdate,
  width,
} from 'react-native-responsive-units';

const DESIGN_VALUES = [24, 48, 100] as const;
const RATIO_VALUES = [0.25, 0.5, 1] as const;
const BOUNDARY_RATIOS = [-0.25, 0, 0.25, 0.5, 1, 1.25] as const;

const COLORS = {
  accent: Platform.select<ColorValue>({
    android: Color.android.dynamic.primary,
    default: '#006b5f',
    ios: Color.ios.systemTeal,
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

type SegmentControlProps<T extends number> = {
  formatLabel: (value: T) => string;
  onChange: (value: T) => void;
  options: readonly T[];
  value: T;
};

function SegmentControl<T extends number>({
  formatLabel,
  onChange,
  options,
  value,
}: SegmentControlProps<T>): React.JSX.Element {
  return (
    <View style={styles.segmentedControl}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option}
            onPress={() => onChange(option)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text
              style={[
                styles.segmentText,
                selected && styles.segmentTextSelected,
              ]}
            >
              {formatLabel(option)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text selectable style={styles.metricLabel}>
        {label}
      </Text>
      <Text selectable style={styles.metricValue}>
        {value}
      </Text>
    </View>
  );
}

export function ResponsiveUnitsTestScreen(): React.JSX.Element {
  useColorScheme();
  useResponsiveUpdate();
  const [designValue, setDesignValue] = useState<
    (typeof DESIGN_VALUES)[number]
  >(DESIGN_VALUES[0]);
  const [widthRatio, setWidthRatio] = useState<(typeof RATIO_VALUES)[number]>(
    RATIO_VALUES[1],
  );
  const [heightRatio, setHeightRatio] = useState<(typeof RATIO_VALUES)[number]>(
    RATIO_VALUES[0],
  );
  const viewportWidth = width(1);
  const viewportHeight = height(1);
  const convertedRpx = rpx(designValue);
  const convertedPx2dp = rpx(designValue);
  const selectedWidth = width(widthRatio);
  const selectedHeight = height(heightRatio);

  return (
    <>
      <Stack.Title>响应式尺寸测试</Stack.Title>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        style={styles.screen}
      >
        <View style={styles.metricsGrid}>
          <Metric label="窗口宽度" value={`${viewportWidth.toFixed(2)} dp`} />
          <Metric label="窗口高度" value={`${viewportHeight.toFixed(2)} dp`} />
          <Metric
            label={`rpx(${designValue})`}
            value={convertedRpx.toFixed(2)}
          />
          <Metric
            label={`px2dp(${designValue})`}
            value={convertedPx2dp.toFixed(2)}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text selectable style={styles.sectionTitle}>
              设计稿单位
            </Text>
            <Text selectable style={styles.sectionValue}>
              {designValue} → {convertedRpx.toFixed(2)} dp
            </Text>
          </View>
          <SegmentControl
            formatLabel={(value) => `${value}`}
            onChange={setDesignValue}
            options={DESIGN_VALUES}
            value={designValue}
          />
          <View style={styles.designPreviewTrack}>
            <View
              accessibilityLabel={`换算后宽度 ${convertedRpx.toFixed(2)}`}
              style={[styles.designPreview, { width: convertedRpx }]}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text selectable style={styles.sectionTitle}>
              窗口宽度比例
            </Text>
            <Text selectable style={styles.sectionValue}>
              {widthRatio} → {selectedWidth.toFixed(2)} dp
            </Text>
          </View>
          <SegmentControl
            formatLabel={(value) => `${value * 100}%`}
            onChange={setWidthRatio}
            options={RATIO_VALUES}
            value={widthRatio}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.widthPreviewScroll}
          >
            <View
              accessibilityLabel={`窗口宽度的 ${widthRatio * 100}%`}
              style={[styles.widthPreview, { width: selectedWidth }]}
            />
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text selectable style={styles.sectionTitle}>
              窗口高度比例
            </Text>
            <Text selectable style={styles.sectionValue}>
              {heightRatio} → {selectedHeight.toFixed(2)} dp
            </Text>
          </View>
          <SegmentControl
            formatLabel={(value) => `${value * 100}%`}
            onChange={setHeightRatio}
            options={RATIO_VALUES}
            value={heightRatio}
          />
          <View
            accessibilityLabel={`窗口高度的 ${heightRatio * 100}%`}
            style={[styles.heightPreview, { height: selectedHeight }]}
          />
        </View>

        <View style={styles.section}>
          <Text selectable style={styles.sectionTitle}>
            比例边界
          </Text>
          <View style={styles.boundaryList}>
            {BOUNDARY_RATIOS.map((ratio) => (
              <View key={ratio} style={styles.boundaryRow}>
                <Text selectable style={styles.boundaryInput}>
                  {ratio}
                </Text>
                <Text selectable style={styles.boundaryValue}>
                  {width(ratio).toFixed(2)} × {height(ratio).toFixed(2)} dp
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  boundaryInput: {
    color: COLORS.text,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    width: 52,
  },
  boundaryList: {
    borderTopColor: COLORS.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  boundaryRow: {
    alignItems: 'center',
    borderBottomColor: COLORS.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 44,
  },
  boundaryValue: {
    color: COLORS.muted,
    flex: 1,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  content: { gap: 24, padding: 16, paddingBottom: 48 },
  designPreview: {
    backgroundColor: COLORS.accent,
    borderCurve: 'continuous',
    borderRadius: 4,
    height: 32,
    minWidth: 1,
  },
  designPreviewTrack: {
    alignItems: 'flex-start',
    backgroundColor: COLORS.background,
    borderCurve: 'continuous',
    borderRadius: 6,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 8,
  },
  heightPreview: {
    backgroundColor: COLORS.accent,
    borderCurve: 'continuous',
    borderRadius: 6,
    minHeight: 1,
    opacity: 0.85,
    width: 72,
  },
  metric: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderCurve: 'continuous',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: '47%',
    flexGrow: 1,
    gap: 6,
    minHeight: 82,
    padding: 14,
  },
  metricLabel: { color: COLORS.muted, fontSize: 13 },
  metricValue: {
    color: COLORS.text,
    fontSize: 20,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  screen: { backgroundColor: COLORS.background },
  section: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderCurve: 'continuous',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 16,
    padding: 16,
  },
  sectionHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  sectionTitle: { color: COLORS.text, fontSize: 17, fontWeight: '700' },
  sectionValue: {
    color: COLORS.muted,
    flexShrink: 1,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  segment: {
    alignItems: 'center',
    borderRadius: 5,
    flex: 1,
    height: 36,
    justifyContent: 'center',
  },
  segmentSelected: {
    backgroundColor: COLORS.surface,
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.12)',
  },
  segmentedControl: {
    backgroundColor: COLORS.background,
    borderCurve: 'continuous',
    borderRadius: 7,
    flexDirection: 'row',
    gap: 2,
    padding: 2,
  },
  segmentText: { color: COLORS.muted, fontSize: 13, fontWeight: '600' },
  segmentTextSelected: { color: COLORS.text },
  widthPreview: {
    backgroundColor: COLORS.accent,
    borderCurve: 'continuous',
    borderRadius: 6,
    height: 72,
    minWidth: 1,
    opacity: 0.85,
  },
  widthPreviewScroll: {
    backgroundColor: COLORS.background,
    borderCurve: 'continuous',
    borderRadius: 6,
    minHeight: 72,
  },
});
