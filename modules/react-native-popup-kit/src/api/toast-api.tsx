import { DefaultToast } from '../components/DefaultToast';
import { PopupDisplayMode } from '../constants';
import { invokeLifecycleCallback } from '../core/lifecycle-callback';
import type { InternalPopupController } from '../core/popup-controller';
import { createPopupId } from '../core/popup-options';
import { ToastPosition, ToastType } from '../toast/constants';
import {
  getToastPopupMode,
  getToastVisibleDuration,
} from '../toast/toast-options';
import type { ToastOptions } from '../toast/types';
import { getGlobalPopupController } from './popup-api';

interface ToastEntry {
  controller: InternalPopupController;
  id: string;
  shown: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

const entries: ToastEntry[] = [];
const TOAST_ANIMATION_DURATION = 180;

export async function showToast(options: ToastOptions): Promise<void> {
  const controller = getGlobalPopupController();
  if (controller === null)
    throw new Error('Global PopupProvider is not mounted.');
  const id = createPopupId();
  const type = options.type ?? ToastType.NONE;
  const position = options.position ?? ToastPosition.CENTER;
  const entry: ToastEntry = { controller, id, shown: false };
  entries.push(entry);

  try {
    await controller.showInternalPopup({
      children: (
        <DefaultToast
          icon={options.icon}
          message={options.message}
          type={type}
        />
      ),
      closeOnClickOverlay: false,
      contentPointerEvents: 'none',
      displayMode: PopupDisplayMode.QUEUE,
      duration: TOAST_ANIMATION_DURATION,
      id,
      mode: getToastPopupMode(position),
      onRemoved: () => {
        if (entry.timer !== undefined) clearTimeout(entry.timer);
        const index = entries.indexOf(entry);
        if (index >= 0) entries.splice(index, 1);
        invokeLifecycleCallback(options.onClose);
      },
      onShown: () => {
        entry.shown = true;
        const visibleDuration = getToastVisibleDuration({ ...options, type });
        if (visibleDuration !== undefined && visibleDuration > 0) {
          entry.timer = setTimeout(
            () => void controller.hidePopup(id),
            visibleDuration,
          );
        }
      },
      overlay: false,
      popupStyle: { alignItems: 'center', overflow: 'visible', width: '100%' },
    });
  } catch (error) {
    const index = entries.indexOf(entry);
    if (index >= 0) entries.splice(index, 1);
    throw error;
  }
}

export function hideToast(): Promise<void> {
  const entry = entries.find((item) => item.shown);
  return entry?.controller.hidePopup(entry.id) ?? Promise.resolve();
}
