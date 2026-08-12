import { use } from 'react';

import type { PopupController } from '../types';
import { PopupContext } from './popup-context';

export function usePopup(): PopupController {
  const context = use(PopupContext);
  if (context === null) {
    throw new Error('usePopup must be used inside PopupProvider.');
  }
  return context.controller;
}
