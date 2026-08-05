import { createContext } from 'react';

import type { PopupApi } from '../types';
import type { PopupRenderHost } from './render-host';

export const PopupContext = createContext<PopupApi | null>(null);
export const PopupRenderHostContext = createContext<PopupRenderHost | null>(
  null,
);
