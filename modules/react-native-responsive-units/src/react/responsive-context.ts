import { createContext } from 'react';

import type { ResponsiveRuntime } from '../core/responsive-runtime';

export const ResponsiveContext = createContext<ResponsiveRuntime | null>(null);
