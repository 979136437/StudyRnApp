import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from '@tanstack/react-query';
import ky, { type Options as KyOptions } from 'ky';

import {
  isRequestCancelled,
  isRetryableRequestError,
  normalizeRequestError,
} from './error';
import type {
  CreateRequestStrategyOptions,
  MutationStrategy,
  MutationStrategyDefinition,
  QueryStrategy,
  QueryStrategyDefinition,
  RequestStrategyRuntime,
} from './types';

const DEFAULT_CACHE_AGE = 24 * 60 * 60 * 1000;
const DEFAULT_STALE_TIME = 5 * 60 * 1000;

export function createRequestStrategy(
  options: CreateRequestStrategyOptions = {},
): RequestStrategyRuntime {
  const client = createClient(options);
  const maxAge = options.persistence?.maxAge ?? DEFAULT_CACHE_AGE;
  const queryClient = options.queryClient ?? createQueryClient(options, maxAge);
  const persister = createAsyncStoragePersister({
    key: options.persistence?.key ?? 'REQUEST_STRATEGY_CACHE',
    storage: AsyncStorage,
    throttleTime: options.persistence?.throttleTime ?? 1000,
  });

  const persistOptions: RequestStrategyRuntime['persistOptions'] = {
    buster: options.persistence?.buster ?? '1',
    dehydrateOptions: {
      shouldDehydrateQuery: (query) =>
        defaultShouldDehydrateQuery(query) && query.meta?.persist === true,
    },
    maxAge,
    persister,
  };

  return {
    clear: async () => {
      queryClient.clear();
      await persister.removeClient();
    },
    client,
    mutation: <TData, TVariables>(
      definition: MutationStrategyDefinition<TData, TVariables>,
    ) => createMutationStrategy(client, queryClient, definition),
    persistOptions,
    query: <TData, TParams>(
      definition: QueryStrategyDefinition<TData, TParams>,
    ) => createQueryDefinition(client, queryClient, definition),
    queryClient,
  };
}

function createClient(options: CreateRequestStrategyOptions) {
  const userHooks = options.ky?.hooks;
  const clientOptions: KyOptions = {
    retry: 0,
    timeout: 15_000,
    ...options.ky,
    hooks: {
      ...userHooks,
      beforeRequest: [
        async ({ request }) => {
          const accessToken = await options.getAccessToken?.();
          if (accessToken && !request.headers.has('Authorization')) {
            request.headers.set('Authorization', `Bearer ${accessToken}`);
          }
        },
        ...(userHooks?.beforeRequest ?? []),
      ],
    },
  };

  if (options.baseUrl !== undefined && options.baseUrl.length > 0) {
    clientOptions.baseUrl = `${options.baseUrl.replace(/\/+$/, '')}/`;
  }

  return ky.create(clientOptions);
}

function createQueryClient(
  options: CreateRequestStrategyOptions,
  maxAge: number,
): QueryClient {
  const configuredDefaults = options.queryClientConfig?.defaultOptions;

  return new QueryClient({
    ...options.queryClientConfig,
    defaultOptions: {
      ...configuredDefaults,
      mutations: {
        retry: false,
        ...configuredDefaults?.mutations,
      },
      queries: {
        gcTime: maxAge,
        retry: (failureCount, error) =>
          failureCount < 2 && isRetryableRequestError(error),
        staleTime: DEFAULT_STALE_TIME,
        ...configuredDefaults?.queries,
      },
    },
  });
}

function createQueryDefinition<TData, TParams>(
  client: RequestStrategyRuntime['client'],
  queryClient: QueryClient,
  definition: QueryStrategyDefinition<TData, TParams>,
): QueryStrategy<TData, TParams> {
  const fetch = async (
    params: TParams,
    signal = new AbortController().signal,
  ): Promise<TData> => {
    try {
      return await definition.request({ client, params, signal });
    } catch (error) {
      if (isRequestCancelled(error)) {
        throw error;
      }
      throw await normalizeRequestError(error);
    }
  };

  return {
    cancel: async (params) => {
      await queryClient.cancelQueries({
        exact: true,
        queryKey: definition.queryKey(params),
      });
    },
    fetch,
    invalidate: async (params) => {
      await queryClient.invalidateQueries({
        queryKey: definition.queryKey(params),
      });
    },
    key: definition.queryKey,
    options: (params) => {
      const options = {
        meta: {
          ...definition.meta,
          persist: definition.persist ?? true,
        },
        queryFn: ({ signal }: { signal: AbortSignal }) => fetch(params, signal),
        queryKey: definition.queryKey(params),
      };

      return {
        ...options,
        ...(definition.gcTime === undefined
          ? undefined
          : { gcTime: definition.gcTime }),
        ...(definition.staleTime === undefined
          ? undefined
          : { staleTime: definition.staleTime }),
      };
    },
    remove: (params) => {
      queryClient.removeQueries({ queryKey: definition.queryKey(params) });
    },
    setData: (params, updater) =>
      queryClient.setQueryData<TData>(definition.queryKey(params), updater),
  };
}

function createMutationStrategy<TData, TVariables>(
  client: RequestStrategyRuntime['client'],
  queryClient: QueryClient,
  definition: MutationStrategyDefinition<TData, TVariables>,
): MutationStrategy<TData, TVariables> {
  const execute = async (variables: TVariables): Promise<TData> => {
    try {
      return await definition.request({ client, variables });
    } catch (error) {
      if (isRequestCancelled(error)) {
        throw error;
      }
      throw await normalizeRequestError(error);
    }
  };

  const synchronize = async (
    data: TData,
    variables: TVariables,
  ): Promise<void> => {
    await definition.sync?.(queryClient, data, variables);
    const queryKeys = await definition.invalidate?.(data, variables);

    if (queryKeys !== undefined) {
      await Promise.all(
        queryKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    }
  };

  return {
    execute,
    options: () => ({
      mutationFn: execute,
      mutationKey: definition.mutationKey,
      onSuccess: synchronize,
    }),
  };
}
