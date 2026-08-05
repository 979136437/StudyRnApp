import { createContext } from 'react';

import type { PopupApi } from '../types';

export const PopupContext = createContext<PopupApi | null>(null);
