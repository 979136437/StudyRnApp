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
    /** 选项字号，Android 使用 sp，iOS 使用 pt。 */
    fontSize?: number;
    indicatorStyle?: StyleProp<ViewStyle>;
    itemHeight?: number;
    magnification?: number;
    onChange?: (event: PickerViewEvent) => void;
    onPickEnd?: (event: PickerViewEvent) => void;
    onPickStart?: (event: PickerViewEvent) => void;
    /** 非中心选项颜色；非法颜色会回退到平台主题文字色。 */
    textColor?: string;
    /** 中心选项颜色；未设置或非法时沿用 textColor。 */
    selectedTextColor?: string;
    value?: readonly number[];
  }>;

export type PickerViewChildren = ReactNode;
