import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';

export interface ModalAction {
  text?: string;
  style?: ViewStyle;
}

export interface ResolvedModalAction {
  text: string;
  style?: ViewStyle;
}

export interface ModalFooterRenderProps {
  confirm: ResolvedModalAction;
  cancel: ResolvedModalAction;
  confirming: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export interface ModalRenderProps extends ModalFooterRenderProps {
  title?: ReactNode;
  content: ReactNode;
  showCancel: boolean;
  close: () => Promise<void>;
}

export interface ModalOptions {
  title?: ReactNode;
  content: ReactNode;
  closeOnClickOverlay?: boolean;
  showCancel?: boolean;
  confirm?: ModalAction;
  cancel?: ModalAction;
  footerRender?: (props: ModalFooterRenderProps) => ReactNode;
  render?: (props: ModalRenderProps) => ReactNode;
  onClose?: () => void;
  onConfirm?: () => Promise<boolean>;
  onCancel?: () => void;
}

export interface ModalController {
  showModal(options: ModalOptions): Promise<void>;
  hideModal(): Promise<void>;
}
