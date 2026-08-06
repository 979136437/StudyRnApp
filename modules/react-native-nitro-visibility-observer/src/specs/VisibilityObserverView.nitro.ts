import type { HybridView, HybridViewProps } from 'react-native-nitro-modules';

export interface NativeVisibilityChangeEvent {
  isVisible: boolean;
  visibleRatio: number;
}

export interface VisibilityObserverNativeProps extends HybridViewProps {
  enabled: boolean;
  threshold: number;
  minimumVisibleDurationMs: number;
  measurementIntervalMs: number;
  onVisibilityChange: (event: NativeVisibilityChangeEvent) => void;
}

export type VisibilityObserverView = HybridView<VisibilityObserverNativeProps>;
