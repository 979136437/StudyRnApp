import type { HybridView, HybridViewProps } from 'react-native-nitro-modules';

export interface NativePickerColumn {
  items: string[];
}

export interface NativePickerEvent {
  value: number[];
  column: number;
}

export interface PickerViewNativeProps extends HybridViewProps {
  columns: NativePickerColumn[];
  value: number[];
  disabled: boolean;
  itemHeight: number;
  magnification: number;
  edgeFadeColor: string;
  edgeFadeSize: number;
  edgeFadeIntensity: number;
  onChange: (event: NativePickerEvent) => void;
  onPickStart: (event: NativePickerEvent) => void;
  onPickEnd: (event: NativePickerEvent) => void;
}

export type PickerView = HybridView<PickerViewNativeProps>;
