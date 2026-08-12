import type {
  PopupController,
  PopupOptions,
  ResolvedPopupOptions,
} from '../types';
import {
  resolvePopupOptions,
  type InternalPopupOptions,
} from './popup-options';
import { PopupStore } from './popup-store';

export interface InternalPopupController extends PopupController {
  store: PopupStore<ResolvedPopupOptions>;
  showInternalPopup(options: InternalPopupOptions): Promise<string>;
  dispose(): void;
}

export function createPopupController(): InternalPopupController {
  const store = new PopupStore<ResolvedPopupOptions>(
    (popup) => popup.displayMode,
    (popup) => popup.onRemoved,
  );
  const controller: InternalPopupController = {
    store,
    async showPopup(options: PopupOptions): Promise<string> {
      return controller.showInternalPopup(options);
    },
    async showInternalPopup(options: InternalPopupOptions): Promise<string> {
      const resolved = resolvePopupOptions(options);
      store.add(resolved.id, resolved.order, resolved);
      return resolved.id;
    },
    hidePopup(id: string): Promise<void> {
      return store.hide(id);
    },
    dispose(): void {
      store.dispose();
    },
  };
  return controller;
}
