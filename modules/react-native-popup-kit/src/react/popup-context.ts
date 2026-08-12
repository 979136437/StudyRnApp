import { createContext } from 'react';

import type { InternalPopupController } from '../core/popup-controller';

export interface PopupContextValue {
  controller: InternalPopupController;
  registerController(controller: InternalPopupController): () => void;
}

export const PopupContext = createContext<PopupContextValue | null>(null);
