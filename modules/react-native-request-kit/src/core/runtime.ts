import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { PersistQueryClientProviderProps } from '@tanstack/react-query-persist-client';

import type { RequestAdapter } from '../adapter/types';
import type {
  AnyMethod,
  CreateRequestOptions,
  ProgressInfo,
  RequestInstance,
} from '../types';

export const EMPTY_PROGRESS: ProgressInfo = {
  loaded: 0,
  percent: 0,
  total: 0,
};

export type Runtime = {
  activeRequests: Map<string, Set<{ abort: () => void }>>;
  destroyed: boolean;
  options: CreateRequestOptions<any, any, any>;
  persistOptions?: PersistQueryClientProviderProps['persistOptions'];
  queryClient: QueryClient;
  requestAdapter: RequestAdapter<any, any>;
  snapshots: AnyMethod[];
  stateUpdaters: Map<string, Set<(states: Record<string, unknown>) => void>>;
};

const runtimes = new WeakMap<RequestInstance<any, any, any>, Runtime>();

export function attachRuntime(
  request: RequestInstance<any, any, any>,
  runtime: Runtime,
): void {
  runtimes.set(request, runtime);
}

export function getRuntime(request: RequestInstance<any, any, any>): Runtime {
  const runtime = runtimes.get(request);
  if (runtime === undefined || runtime.destroyed) {
    throw new Error('The request instance has been destroyed');
  }
  return runtime;
}

export function keyHash(queryKey: QueryKey): string {
  return stableSerialize(queryKey);
}

export function stableSerialize(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, current: unknown) => {
    if (current instanceof Headers) {
      return [...current.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      );
    }
    if (current instanceof Date) {
      return current.toISOString();
    }
    if (current instanceof FormData) {
      return '[FormData]';
    }
    if (current instanceof Blob) {
      return `[Blob:${current.type}:${current.size}]`;
    }
    if (typeof current === 'object' && current !== null) {
      if (seen.has(current)) {
        return '[Circular]';
      }
      seen.add(current);
      if (!Array.isArray(current)) {
        return Object.fromEntries(
          Object.entries(current).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        );
      }
    }
    return current;
  });
}

export function isIdempotent(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}
