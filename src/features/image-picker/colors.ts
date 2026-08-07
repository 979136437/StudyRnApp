import { Color } from 'expo-router';
import { Platform, type ColorValue } from 'react-native';

export const imagePickerColors = {
  accent: Platform.select<ColorValue>({
    android: Color.android.dynamic.primary,
    default: '#1677c8',
    ios: Color.ios.systemBlue,
  }),
  background: Platform.select<ColorValue>({
    android: Color.android.dynamic.surface,
    default: '#f5f5f7',
    ios: Color.ios.systemGroupedBackground,
  }),
  border: Platform.select<ColorValue>({
    android: Color.android.dynamic.outlineVariant,
    default: '#d8d8dc',
    ios: Color.ios.separator,
  }),
  danger: Platform.select<ColorValue>({
    android: Color.android.material.error40,
    default: '#d70015',
    ios: Color.ios.systemRed,
  }),
  muted: Platform.select<ColorValue>({
    android: Color.android.dynamic.onSurfaceVariant,
    default: '#62626a',
    ios: Color.ios.secondaryLabel,
  }),
  surface: Platform.select<ColorValue>({
    android: Color.android.dynamic.surfaceContainer,
    default: '#ffffff',
    ios: Color.ios.secondarySystemGroupedBackground,
  }),
  text: Platform.select<ColorValue>({
    android: Color.android.dynamic.onSurface,
    default: '#1c1c1e',
    ios: Color.ios.label,
  }),
};
