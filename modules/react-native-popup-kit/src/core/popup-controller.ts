import type {
  PopupController,
  PopupOptions,
  ResolvedPopupOptions,
} from '../types';
import { resolvePopupOptions } from './popup-options';
import { PopupStore } from './popup-store';

export interface InternalPopupController extends PopupController {
  store: PopupStore<ResolvedPopupOptions>;
  dispose(): void;
}

export function createPopupController(): InternalPopupController {
  const store = new PopupStore<ResolvedPopupOptions>(
    (popup) => popup.displayMode,
  );

  return {
    store,
    async showPopup(options: PopupOptions): Promise<string> {
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
}
