import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { MediaCacheContextValue, MediaCacheProviderProps } from '../types';

const MediaCacheContext = createContext<MediaCacheContextValue | null>(null);

export function MediaCacheProvider({
  children,
  defaultEnabled = true,
  strategy,
}: MediaCacheProviderProps): React.JSX.Element {
  const [enabled, setEnabledState] = useState(defaultEnabled);

  const setEnabled = useCallback(
    (nextEnabled: boolean) => {
      strategy.setEnabled(nextEnabled);
      setEnabledState(nextEnabled);
    },
    [strategy],
  );

  useEffect(() => {
    strategy.setEnabled(enabled);
  }, [enabled, strategy]);

  const value = useMemo<MediaCacheContextValue>(
    () => ({
      clear: strategy.clear,
      enabled,
      getEntries: strategy.getEntries,
      getStats: strategy.getStats,
      prefetch: strategy.prefetch,
      remove: strategy.remove,
      setEnabled,
      strategy,
    }),
    [enabled, setEnabled, strategy],
  );

  return <MediaCacheContext value={value}>{children}</MediaCacheContext>;
}

export function useMediaCache(): MediaCacheContextValue {
  const context = use(MediaCacheContext);
  if (!context) {
    throw new Error('useMediaCache 必须在 MediaCacheProvider 内使用');
  }
  return context;
}

export function useOptionalMediaCache(): MediaCacheContextValue | null {
  return use(MediaCacheContext);
}
