import type {
  QueryClient,
  QueryClientConfig,
  QueryKey,
  UseMutationOptions,
  UseQueryOptions,
} from '@tanstack/react-query';
import type { PersistQueryClientProviderProps } from '@tanstack/react-query-persist-client';
import type { KyInstance, Options as KyOptions } from 'ky';

import type { RequestError } from './error';

export type MaybePromise<T> = Promise<T> | T;

export type RequestContext<TParams> = {
  client: KyInstance;
  params: TParams;
  signal: AbortSignal;
};

export type MutationRequestContext<TVariables> = {
  client: KyInstance;
  variables: TVariables;
};

export type QueryStrategyDefinition<TData, TParams> = {
  gcTime?: number;
  meta?: Record<string, unknown>;
  persist?: boolean;
  queryKey: (params: TParams) => QueryKey;
  request: (context: RequestContext<TParams>) => Promise<TData>;
  staleTime?: number;
};

export type MutationStrategyDefinition<TData, TVariables> = {
  invalidate?: (
    data: TData,
    variables: TVariables,
  ) => MaybePromise<readonly QueryKey[]>;
  mutationKey?: QueryKey;
  request: (context: MutationRequestContext<TVariables>) => Promise<TData>;
  sync?: (
    queryClient: QueryClient,
    data: TData,
    variables: TVariables,
  ) => MaybePromise<void>;
};

export type PersistenceOptions = {
  buster?: string;
  key?: string;
  maxAge?: number;
  throttleTime?: number;
};

export type CreateRequestStrategyOptions = {
  baseUrl?: string;
  getAccessToken?: () => MaybePromise<string | undefined>;
  ky?: KyOptions;
  persistence?: PersistenceOptions;
  queryClient?: QueryClient;
  queryClientConfig?: QueryClientConfig;
};

export type RequestStrategyRuntime = {
  clear: () => Promise<void>;
  client: KyInstance;
  mutation: <TData, TVariables>(
    definition: MutationStrategyDefinition<TData, TVariables>,
  ) => MutationStrategy<TData, TVariables>;
  persistOptions: PersistQueryClientProviderProps['persistOptions'];
  query: <TData, TParams>(
    definition: QueryStrategyDefinition<TData, TParams>,
  ) => QueryStrategy<TData, TParams>;
  queryClient: QueryClient;
};

export type QueryStrategy<TData, TParams> = {
  cancel: (params: TParams) => Promise<void>;
  fetch: (params: TParams, signal?: AbortSignal) => Promise<TData>;
  invalidate: (params: TParams) => Promise<void>;
  key: (params: TParams) => QueryKey;
  options: (
    params: TParams,
  ) => UseQueryOptions<TData, RequestError, TData, QueryKey>;
  remove: (params: TParams) => void;
  setData: (
    params: TParams,
    updater: TData | ((current: TData | undefined) => TData | undefined),
  ) => TData | undefined;
};

export type MutationStrategy<TData, TVariables> = {
  execute: (variables: TVariables) => Promise<TData>;
  options: () => UseMutationOptions<TData, RequestError, TVariables, unknown>;
};

export type RequestStrategyProviderProps = {
  children: React.ReactNode;
  runtime: RequestStrategyRuntime;
};

export type RequestStrategyError = RequestError;
