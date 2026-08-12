import { PopupDisplayMode, PopupMode } from '../constants';
import type { PopupOptions, ResolvedPopupOptions } from '../types';

export interface InternalPopupOptions extends PopupOptions {
  contentPointerEvents?: 'auto' | 'box-none' | 'none' | 'box-only';
  onRemoved?: () => void;
  onShown?: () => void;
}

let nextPopupId = 0;
let nextPopupOrder = 0;

export function createPopupId(): string {
  nextPopupId += 1;
  return `popup-${Date.now().toString(36)}-${nextPopupId.toString(36)}`;
}

export function resolvePopupOptions(
  options: InternalPopupOptions,
): ResolvedPopupOptions {
  const id = options.id?.trim() || createPopupId();
  const duration = Number.isFinite(options.duration)
    ? Math.max(0, options.duration ?? 300)
    : 300;
  nextPopupOrder += 1;

  return {
    ...options,
    displayMode: options.displayMode ?? PopupDisplayMode.QUEUE,
    id,
    order: nextPopupOrder,
    mode: options.mode ?? PopupMode.CENTER,
    duration,
    closeOnClickOverlay: options.closeOnClickOverlay ?? true,
    overlay: options.overlay ?? true,
  };
}
