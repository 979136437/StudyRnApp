import type { PropsWithChildren, ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import type { PopupDisplayMode, PopupMode } from './constants';

export type { PopupDisplayMode, PopupMode } from './constants';

export interface PopupOptions {
  id?: string;
  children: ReactNode;
  displayMode?: PopupDisplayMode;
  mode?: PopupMode;
  duration?: number;
  shareValue?: SharedValue<number>;
  popupStyle?: StyleProp<ViewStyle>;
  overlayStyle?: StyleProp<ViewStyle>;
  overlayContent?: ReactNode;
  closeOnClickOverlay?: boolean;
  overlay?: boolean;
}

export interface PopupController {
  showPopup(options: PopupOptions): Promise<string>;
  hidePopup(id: string): Promise<void>;
}

export type PopupProviderProps = PropsWithChildren;

export interface ResolvedPopupOptions extends PopupOptions {
  displayMode: PopupDisplayMode;
  id: string;
  order: number;
  mode: PopupMode;
  duration: number;
  closeOnClickOverlay: boolean;
  overlay: boolean;
  contentPointerEvents?: 'auto' | 'box-none' | 'none' | 'box-only';
  onRemoved?: () => void;
  onShown?: () => void;
}
