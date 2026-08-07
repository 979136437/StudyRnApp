import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { getRuntime } from '../core/runtime';
import type { RequestProviderProps } from '../types';

export function RequestProvider({
  children,
  request,
}: RequestProviderProps): React.JSX.Element {
  const runtime = getRuntime(request);

  useEffect(() => {
    focusManager.setFocused(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => {
      focusManager.setFocused(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  if (runtime.persistOptions === undefined) {
    return (
      <QueryClientProvider client={runtime.queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  return (
    <PersistQueryClientProvider
      client={runtime.queryClient}
      onSuccess={() =>
        runtime.queryClient.invalidateQueries({
          predicate: (query) => query.meta?.persist === true,
        })
      }
      persistOptions={runtime.persistOptions}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
