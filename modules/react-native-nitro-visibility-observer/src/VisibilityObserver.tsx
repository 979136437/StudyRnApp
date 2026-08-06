import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { callback, getHostComponent } from 'react-native-nitro-modules';

import VisibilityObserverViewConfig from '../nitrogen/generated/shared/json/VisibilityObserverViewConfig.json';
import { normalizeVisibilityOptions } from './core/visibility';
import type {
  NativeVisibilityChangeEvent,
  VisibilityObserverNativeProps,
} from './specs/VisibilityObserverView.nitro';
import type { VisibilityChangeEvent, VisibilityObserverProps } from './types';

const NativeVisibilityObserver = getHostComponent<
  VisibilityObserverNativeProps,
  Record<string, never>
>('VisibilityObserverView', () => VisibilityObserverViewConfig);

export function VisibilityObserver({
  children,
  enabled,
  measurementIntervalMs,
  minimumVisibleDurationMs,
  onVisibilityChange,
  style,
  threshold,
  ...viewProps
}: VisibilityObserverProps): React.JSX.Element {
  const callbackRef = useRef(onVisibilityChange);
  const normalized = normalizeVisibilityOptions({
    enabled,
    measurementIntervalMs,
    minimumVisibleDurationMs,
    threshold,
  });

  useEffect(() => {
    // Nitro 回调保持稳定，仅更新目标函数，避免普通 React 重渲染反复替换原生属性。
    callbackRef.current = onVisibilityChange;
  }, [onVisibilityChange]);

  const nativeCallback = useMemo(
    () =>
      callback((event: NativeVisibilityChangeEvent) => {
        callbackRef.current?.(event as VisibilityChangeEvent);
      }),
    [],
  );

  return (
    <View {...viewProps} collapsable={false} style={style}>
      {children}
      <NativeVisibilityObserver
        enabled={normalized.enabled}
        measurementIntervalMs={normalized.measurementIntervalMs}
        minimumVisibleDurationMs={normalized.minimumVisibleDurationMs}
        onVisibilityChange={nativeCallback}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        threshold={normalized.threshold}
      />
    </View>
  );
}
