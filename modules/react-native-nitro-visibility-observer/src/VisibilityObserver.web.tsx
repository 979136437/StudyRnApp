import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';

import { normalizeVisibilityOptions } from './core/visibility';
import type { VisibilityChangeEvent, VisibilityObserverProps } from './types';
import { observeWebVisibility } from './web-observer';

export function VisibilityObserver({
  children,
  enabled,
  measurementIntervalMs,
  minimumVisibleDurationMs,
  onVisibilityChange,
  threshold,
  ...viewProps
}: VisibilityObserverProps): React.JSX.Element {
  const elementRef = useRef<View>(null);
  const callbackRef = useRef(onVisibilityChange);
  const normalized = useMemo(
    () =>
      normalizeVisibilityOptions({
        enabled,
        measurementIntervalMs,
        minimumVisibleDurationMs,
        threshold,
      }),
    [enabled, measurementIntervalMs, minimumVisibleDurationMs, threshold],
  );

  useEffect(() => {
    callbackRef.current = onVisibilityChange;
  }, [onVisibilityChange]);

  useEffect(() => {
    const element = elementRef.current as unknown as Element | null;
    if (element === null || typeof IntersectionObserver === 'undefined') {
      callbackRef.current?.({ isVisible: false, visibleRatio: 0 });
      return;
    }

    return observeWebVisibility(
      element,
      normalized,
      (event: VisibilityChangeEvent) => callbackRef.current?.(event),
    );
  }, [normalized]);

  return (
    <View {...viewProps} ref={elementRef} collapsable={false}>
      {children}
    </View>
  );
}
