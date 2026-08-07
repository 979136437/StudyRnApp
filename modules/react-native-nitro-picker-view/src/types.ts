import type { ReactElement, ReactNode } from 'react';
import type { StyleProp, ViewProps, ViewStyle } from 'react-native';

export type PickerTextItem = string | number;

export type PickerViewColumnProps = Readonly<{
  children?: PickerTextItem | readonly PickerTextItem[];
}>;

export type PickerViewEvent = Readonly<{
  value: readonly number[];
  column: number;
}>;

export type PickerViewProps = Omit<ViewProps, 'children'> &
  Readonly<{
    children?:
      | ReactElement<PickerViewColumnProps>
      | readonly ReactElement<PickerViewColumnProps>[];
    disabled?: boolean;
    edgeFadeColor?: string;
    edgeFadeIntensity?: number;
    edgeFadeSize?: number;
    indicatorStyle?: StyleProp<ViewStyle>;
    itemHeight?: number;
    magnification?: number;
    onChange?: (event: PickerViewEvent) => void;
    onPickEnd?: (event: PickerViewEvent) => void;
    onPickStart?: (event: PickerViewEvent) => void;
    value?: readonly number[];
  }>;

export type PickerViewChildren = ReactNode;
