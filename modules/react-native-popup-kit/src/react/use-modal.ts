import { use } from 'react';

import { getModalController } from '../api/modal-api';
import type { ModalController } from '../modal/types';
import { PopupContext } from './popup-context';

export function useModal(): ModalController {
  const context = use(PopupContext);
  if (context === null)
    throw new Error('useModal must be used inside PopupProvider.');
  return getModalController(context.controller);
}
