import { PopupMode } from '../constants';
import { ToastPosition, ToastType } from './constants';
import type { ToastOptions } from './types';

export const DEFAULT_TOAST_DURATION = 2000;

export function getToastPopupMode(
  position: ToastOptions['position'],
): PopupMode {
  if (position === ToastPosition.TOP) return PopupMode.TOP;
  if (position === ToastPosition.BOTTOM) return PopupMode.BOTTOM;
  return PopupMode.CENTER;
}

export function getToastVisibleDuration(
  options: ToastOptions,
): number | undefined {
  if (options.duration !== undefined) {
    return Number.isFinite(options.duration)
      ? Math.max(0, options.duration)
      : DEFAULT_TOAST_DURATION;
  }
  return options.type === ToastType.LOADING
    ? undefined
    : DEFAULT_TOAST_DURATION;
}
