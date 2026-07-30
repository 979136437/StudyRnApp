import { focusManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import type { RequestStrategyProviderProps } from './types';

export function RequestStrategyProvider({
  children,
  runtime,
}: RequestStrategyProviderProps): React.JSX.Element {
  useEffect(() => {
    focusManager.setFocused(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => {
      focusManager.setFocused(state === 'active');
    });

    return () => subscription.remove();
  }, []);

  return (
    <PersistQueryClientProvider
      client={runtime.queryClient}
      persistOptions={runtime.persistOptions}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
