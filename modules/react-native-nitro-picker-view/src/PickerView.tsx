import { useLayoutEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { callback, getHostComponent } from 'react-native-nitro-modules';

import PickerViewConfig from '../nitrogen/generated/shared/json/PickerViewConfig.json';
import { DEFAULT_INDICATOR_BORDER_COLOR } from './constants';
import {
  extractColumns,
  normalizePickerOptions,
  normalizePickerValue,
} from './core/picker';
import { PickerViewColumn } from './PickerViewColumn';
import type {
  NativePickerEvent,
  PickerViewNativeProps,
} from './specs/PickerView.nitro';
import type { PickerViewEvent, PickerViewProps } from './types';

const NativePickerView = getHostComponent<
  PickerViewNativeProps,
  Record<string, never>
>('PickerView', () => PickerViewConfig);

export function PickerView({
  children,
  disabled,
  edgeFadeColor,
  edgeFadeIntensity,
  edgeFadeSize,
  indicatorStyle,
  itemHeight,
  magnification,
  onChange,
  onPickEnd,
  onPickStart,
  style,
  value,
  ...viewProps
}: PickerViewProps): React.JSX.Element {
  const columns = useMemo(
    () => extractColumns(children, PickerViewColumn),
    [children],
  );
  const normalizedValue = useMemo(
    () => normalizePickerValue(value, columns),
    [columns, value],
  );
  const options = normalizePickerOptions({
    disabled,
    edgeFadeIntensity,
    edgeFadeSize,
    itemHeight,
    magnification,
  });
  const flattenedStyle = StyleSheet.flatten(style);
  const resolvedFadeColor =
    edgeFadeColor ??
    (typeof flattenedStyle?.backgroundColor === 'string'
      ? flattenedStyle.backgroundColor
      : '');

  const handlersRef = useRef({ onChange, onPickEnd, onPickStart });
  useLayoutEffect(() => {
    handlersRef.current = { onChange, onPickEnd, onPickStart };
    return () => {
      handlersRef.current = {
        onChange: undefined,
        onPickEnd: undefined,
        onPickStart: undefined,
      };
    };
  }, [onChange, onPickEnd, onPickStart]);

  const nativeCallbacks = useMemo(
    () => ({
      onChange: callback((event: NativePickerEvent) => {
        handlersRef.current.onChange?.(event as PickerViewEvent);
      }),
      onPickEnd: callback((event: NativePickerEvent) => {
        handlersRef.current.onPickEnd?.(event as PickerViewEvent);
      }),
      onPickStart: callback((event: NativePickerEvent) => {
        handlersRef.current.onPickStart?.(event as PickerViewEvent);
      }),
    }),
    [],
  );

  const nativeColumns = useMemo(
    () => columns.map((items) => ({ items })),
    [columns],
  );

  return (
    <View {...viewProps} style={style}>
      <NativePickerView
        columns={nativeColumns}
        disabled={options.disabled}
        edgeFadeColor={resolvedFadeColor}
        edgeFadeIntensity={options.edgeFadeIntensity}
        edgeFadeSize={options.edgeFadeSize}
        itemHeight={options.itemHeight}
        magnification={options.magnification}
        onChange={nativeCallbacks.onChange}
        onPickEnd={nativeCallbacks.onPickEnd}
        onPickStart={nativeCallbacks.onPickStart}
        style={StyleSheet.absoluteFill}
        value={normalizedValue}
      />
      <View
        pointerEvents="none"
        style={[
          styles.indicator,
          {
            height: options.itemHeight,
            transform: [{ translateY: -options.itemHeight / 2 }],
          },
          indicatorStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  indicator: {
    borderBottomColor: DEFAULT_INDICATOR_BORDER_COLOR,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: DEFAULT_INDICATOR_BORDER_COLOR,
    borderTopWidth: StyleSheet.hairlineWidth,
    left: 0,
    position: 'absolute',
    right: 0,
    top: '50%',
  },
});
