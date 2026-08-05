import type { ComponentType, ReactNode } from 'react';
import type { ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';

export type PopupId = string;

export type PopupScope = 'global' | 'local';

export type PopupPlacement = 'center' | 'top' | 'bottom' | 'left' | 'right';

export type PopupKind = 'popup' | 'toast' | 'loading' | 'modal';

export type PopupCloseReason =
  | 'api'
  | 'all'
  | 'overlay'
  | 'back'
  | 'timeout'
  | 'replaced'
  | 'confirm'
  | 'cancel';

export interface PopupCallbackResult {
  errMsg: string;
}

export interface PopupErrorResult extends PopupCallbackResult {
  code: PopupErrorCode;
}

export type PopupErrorCode =
  | 'DUPLICATE_ID'
  | 'HOST_UNAVAILABLE'
  | 'HOST_UNMOUNTED'
  | 'INVALID_OPTIONS';

export interface PopupCallbacks<TResult extends PopupCallbackResult> {
  success?: (result: TResult) => void;
  fail?: (result: PopupErrorResult) => void;
  complete?: (result: TResult | PopupErrorResult) => void;
}

export interface PopupResult extends PopupCallbackResult {
  id: PopupId;
  closeReason: PopupCloseReason;
}

export interface ModalResult extends PopupResult {
  confirm: boolean;
  cancel: boolean;
  content: string;
}

export interface ClosePopupResult {
  id: PopupId;
  closed: boolean;
  kind?: PopupKind;
  closeReason: 'api';
}

export interface CloseAllPopupsResult {
  closed: number;
  ids: PopupId[];
  closeReason: 'all';
}

export type PopupTask<TResult> = Promise<TResult> & {
  readonly id: PopupId;
};

export interface PopupRenderContext {
  id: PopupId;
  close: () => Promise<ClosePopupResult>;
}

export interface ShowPopupOptions extends PopupCallbacks<PopupResult> {
  id?: PopupId;
  content?: ReactNode | ((context: PopupRenderContext) => ReactNode);
  placement?: PopupPlacement;
  mask?: boolean;
  closeOnMaskPress?: boolean;
  closeOnBackPress?: boolean;
  useSafeArea?: boolean;
  style?: StyleProp<ViewStyle>;
  component?: ComponentType<PopupComponentProps>;
}

export type ToastIcon = 'success' | 'error' | 'loading' | 'none';

export interface ShowToastOptions extends PopupCallbacks<PopupCallbackResult> {
  id?: PopupId;
  title: string;
  icon?: ToastIcon;
  image?: string | ImageSourcePropType;
  duration?: number;
  mask?: boolean;
  component?: ComponentType<ToastComponentProps>;
}

export interface ShowLoadingOptions extends PopupCallbacks<PopupCallbackResult> {
  id?: PopupId;
  title: string;
  mask?: boolean;
  component?: ComponentType<LoadingComponentProps>;
}

export interface HidePromptOptions extends PopupCallbacks<PopupCallbackResult> {
  noConflict?: boolean;
}

export interface ShowModalOptions extends PopupCallbacks<ModalResult> {
  id?: PopupId;
  title?: string;
  content?: string;
  showCancel?: boolean;
  cancelText?: string;
  cancelColor?: string;
  confirmText?: string;
  confirmColor?: string;
  editable?: boolean;
  placeholderText?: string;
  component?: ComponentType<ModalComponentProps>;
}

export interface PopupComponentProps extends PopupRenderContext {
  options: ShowPopupOptions;
}

export interface ToastComponentProps extends PopupRenderContext {
  options: ShowToastOptions;
}

export interface LoadingComponentProps extends PopupRenderContext {
  options: ShowLoadingOptions;
}

export interface ModalComponentProps extends PopupRenderContext {
  options: ShowModalOptions;
  value: string;
  onChangeText: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface PopupProviderProps {
  children: ReactNode;
  scope?: PopupScope;
  style?: StyleProp<ViewStyle>;
}

export interface PopupApi {
  showPopup(options: ShowPopupOptions): PopupTask<PopupResult>;
  showToast(options: ShowToastOptions): PopupTask<PopupCallbackResult>;
  hideToast(options?: HidePromptOptions): Promise<PopupCallbackResult>;
  showLoading(options: ShowLoadingOptions): PopupTask<PopupCallbackResult>;
  hideLoading(options?: HidePromptOptions): Promise<PopupCallbackResult>;
  showModal(options: ShowModalOptions): PopupTask<ModalResult>;
}

export interface ToastApi {
  showToast(options: ShowToastOptions): PopupTask<PopupCallbackResult>;
  hideToast(options?: HidePromptOptions): Promise<PopupCallbackResult>;
}

export interface LoadingApi {
  showLoading(options: ShowLoadingOptions): PopupTask<PopupCallbackResult>;
  hideLoading(options?: HidePromptOptions): Promise<PopupCallbackResult>;
}

export interface ModalApi {
  showModal(options: ShowModalOptions): PopupTask<ModalResult>;
}
