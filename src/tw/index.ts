import { useUnstableNativeVariable } from 'nativewind';

export { Image } from './hoc';

export {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableHighlight,
  View,
} from 'react-native';

export type {
  PressableProps,
  ScrollViewProps,
  TextInputProps,
  TextProps,
  TouchableHighlightProps,
  ViewProps,
} from 'react-native';

export const useCSSVariable =
  process.env.EXPO_OS === 'web'
    ? (variable: string) => `var(${variable})`
    : useUnstableNativeVariable;
