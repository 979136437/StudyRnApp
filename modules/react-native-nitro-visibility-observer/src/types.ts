import type { PropsWithChildren } from 'react';
import type { ViewProps } from 'react-native';

export type VisibilityChangeEvent = Readonly<{
  isVisible: boolean;
  visibleRatio: number;
}>;

export type VisibilityObserverProps = PropsWithChildren<
  ViewProps & {
    enabled?: boolean;
    measurementIntervalMs?: number;
    minimumVisibleDurationMs?: number;
    onVisibilityChange?: (event: VisibilityChangeEvent) => void;
    threshold?: number;
  }
>;
