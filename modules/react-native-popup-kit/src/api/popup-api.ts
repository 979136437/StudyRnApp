import type { InternalPopupController } from '../core/popup-controller';
import type { PopupOptions } from '../types';

let globalController: InternalPopupController | null = null;

export function registerGlobalPopupController(
  controller: InternalPopupController,
): () => void {
  globalController = controller;
  return () => {
    if (globalController === controller) globalController = null;
  };
}

export function showPopup(options: PopupOptions): Promise<string> {
  if (globalController === null) {
    return Promise.reject(new Error('Global PopupProvider is not mounted.'));
  }
  return globalController.showPopup(options);
}

export function hidePopup(id: string): Promise<void> {
  return globalController?.hidePopup(id) ?? Promise.resolve();
}
