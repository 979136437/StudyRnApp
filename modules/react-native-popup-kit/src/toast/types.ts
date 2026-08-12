import type { ReactNode } from 'react';

import type { ToastPosition, ToastType } from './constants';

export interface ToastOptions {
  icon?: ReactNode;
  message: ReactNode;
  type?: ToastType;
  position?: ToastPosition;
  duration?: number;
  onClose?: () => void;
}
