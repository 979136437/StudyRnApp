import type { Persister } from '@tanstack/react-query-persist-client';

import type { RequestAdapter } from './adapter/types';
import type { RequestError } from './client/error';
import type { Method } from './client/Method';

export type AnyMethod<TData = unknown> = Method<TData, any, any, any>;

export type MaybePromise<T> = Promise<T> | T;
export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS';
export type ResponseType =
  | 'json'
  | 'text'
  | 'blob'
  | 'arrayBuffer'
  | 'formData';
export type CacheMode = 'memory' | 'restore' | 'swr';

export type CacheForConfig = {
  expire?: number | Date;
  mode?: CacheMode;
  staleTime?: number;
  tag?: string;
};

export type CacheFor = number | Date | CacheForConfig | null;

export type RetryConfig = {
  delay?: number | ((failureCount: number, error: RequestError) => number);
  limit?: number;
};

export type ProgressInfo = {
  loaded: number;
  percent: number;
  total: number;
};

export type MethodMatcher =
  | string
  | RegExp
  | {
      filter?: (
        method: AnyMethod,
        index: number,
        methods: readonly AnyMethod[],
      ) => boolean;
      name?: string | RegExp;
    };

export type MethodConfig<
  TData = unknown,
  TTransformed = unknown,
  TResponseHeaders = unknown,
> = {
  cacheFor?: CacheFor;
  headers?: HeadersInit;
  hitSource?: AnyMethod | readonly AnyMethod[] | MethodMatcher;
  meta?: Record<string, unknown>;
  name?: string;
  params?: Record<string, string | number | boolean | null | undefined>;
  responseType?: ResponseType;
  retry?: number | RetryConfig | false;
  timeout?: number;
  transform?: (
    data: TTransformed,
    headers: TResponseHeaders,
  ) => MaybePromise<TData>;
};

export type RespondedHandlers<TResponse = Response, TTransformed = unknown> = {
  onComplete?: (
    method: AnyMethod,
    result: {
      data?: unknown;
      error?: RequestError;
      status: 'success' | 'error';
    },
  ) => MaybePromise<void>;
  onError?: (error: RequestError, method: AnyMethod) => MaybePromise<unknown>;
  onSuccess?: (
    response: TResponse,
    method: AnyMethod,
  ) => MaybePromise<TTransformed>;
};

export type CreateRequestOptions<
  TResponse = Response,
  TResponseHeaders = Headers,
  TTransformed = unknown,
> = {
  baseUrl?: string;
  beforeRequest?: (method: AnyMethod) => MaybePromise<void>;
  cacheFor?: CacheFor | Partial<Record<HttpMethod, CacheFor>>;
  headers?: Record<string, string>;
  requestAdapter?: RequestAdapter<TResponse, TResponseHeaders>;
  responded?: RespondedHandlers<TResponse, TTransformed>;
  retry?: number | RetryConfig | false;
  shareRequest?: boolean;
  StoragePersister?: StoragePersister;
  timeout?: number;
};

export type SnapshotCollection = {
  match(matcher: MethodMatcher, exact?: false): readonly AnyMethod[];
  match(matcher: MethodMatcher, exact: true): AnyMethod | undefined;
};

export type RequestInstance<
  TResponse = Response,
  TResponseHeaders = Headers,
  TTransformed = unknown,
> = {
  Delete<TData = unknown, TBody = unknown>(
    url: string,
    data?: TBody,
    config?: MethodConfig<TData, TTransformed, TResponseHeaders>,
  ): Method<TData, TResponse, TResponseHeaders, TTransformed>;
  Get<TData = unknown>(
    url: string,
    config?: MethodConfig<TData, TTransformed, TResponseHeaders>,
  ): Method<TData, TResponse, TResponseHeaders, TTransformed>;
  Head<TData = unknown>(
    url: string,
    config?: MethodConfig<TData, TTransformed, TResponseHeaders>,
  ): Method<TData, TResponse, TResponseHeaders, TTransformed>;
  Options<TData = unknown>(
    url: string,
    config?: MethodConfig<TData, TTransformed, TResponseHeaders>,
  ): Method<TData, TResponse, TResponseHeaders, TTransformed>;
  Patch<TData = unknown, TBody = unknown>(
    url: string,
    data?: TBody,
    config?: MethodConfig<TData, TTransformed, TResponseHeaders>,
  ): Method<TData, TResponse, TResponseHeaders, TTransformed>;
  Post<TData = unknown, TBody = unknown>(
    url: string,
    data?: TBody,
    config?: MethodConfig<TData, TTransformed, TResponseHeaders>,
  ): Method<TData, TResponse, TResponseHeaders, TTransformed>;
  Put<TData = unknown, TBody = unknown>(
    url: string,
    data?: TBody,
    config?: MethodConfig<TData, TTransformed, TResponseHeaders>,
  ): Method<TData, TResponse, TResponseHeaders, TTransformed>;
  Request<TData = unknown, TBody = unknown>(
    method: HttpMethod,
    url: string,
    data?: TBody,
    config?: MethodConfig<TData, TTransformed, TResponseHeaders>,
  ): Method<TData, TResponse, TResponseHeaders, TTransformed>;
  clear(): Promise<void>;
  destroy(): void;
  snapshots: SnapshotCollection;
};

export type StoragePersister = Persister;

export type RequestProviderProps = {
  children: React.ReactNode;
  request: RequestInstance<any, any, any>;
};

export type HookEvent<TData> = {
  args: readonly unknown[];
  data: TData;
  fromCache: boolean;
  method: AnyMethod<TData>;
};

export type HookErrorEvent<TData> = {
  args: readonly unknown[];
  error: RequestError;
  method: AnyMethod<TData>;
};

export type HookCompleteEvent<TData> = {
  args: readonly unknown[];
  data?: TData;
  error?: RequestError;
  fromCache?: boolean;
  method: AnyMethod<TData>;
  status: 'success' | 'error';
};

export type HookMiddlewareContext<TData> = {
  abort: () => void;
  args: readonly unknown[];
  method: AnyMethod<TData>;
  send: () => Promise<TData>;
};

export type HookConfig<TData> = {
  force?: boolean | ((...args: unknown[]) => boolean);
  immediate?: boolean;
  initialData?: TData;
  managedStates?: Record<string, unknown>;
  middleware?: (
    context: HookMiddlewareContext<TData>,
    next: () => Promise<TData>,
  ) => Promise<TData>;
};

export type WatcherHookConfig<TData> = HookConfig<TData> & {
  abortLast?: boolean;
  debounce?: number | readonly number[];
};

export type FrontStates<TData> = {
  data?: TData | ((current: TData | undefined) => TData | undefined);
  error?: RequestError;
  loading?: boolean;
  [key: string]: unknown;
};

export type UseRequestResult<TData> = {
  abort: () => void;
  data: TData | undefined;
  downloading: ProgressInfo;
  error: RequestError | undefined;
  fetching: boolean;
  loading: boolean;
  onComplete: (
    callback: (event: HookCompleteEvent<TData>) => void,
  ) => UseRequestResult<TData>;
  onError: (
    callback: (event: HookErrorEvent<TData>) => void,
  ) => UseRequestResult<TData>;
  onSuccess: (
    callback: (event: HookEvent<TData>) => void,
  ) => UseRequestResult<TData>;
  send: (...args: unknown[]) => Promise<TData>;
  update: (states: FrontStates<TData>) => void;
  uploading: ProgressInfo;
  [key: string]: unknown;
};

export type UseFetcherResult<TData> = Omit<UseRequestResult<TData>, 'send'> & {
  fetch: (method: AnyMethod<TData>, force?: boolean) => Promise<TData>;
};

export type PaginationActions<TRow> = {
  insert?: (row: TRow) => Promise<void>;
  remove?: (row: TRow) => Promise<void>;
  replace?: (row: TRow) => Promise<void>;
};

export type PaginationConfig<TResponse, TRow> = WatcherHookConfig<TResponse> & {
  actions?: PaginationActions<TRow>;
  append?: boolean;
  data?: (response: TResponse) => readonly TRow[];
  initialPage?: number;
  initialPageSize?: number;
  preloadNextPage?: boolean;
  preloadPreviousPage?: boolean;
  total?: (response: TResponse) => number;
};

export type PaginationResult<TRow> = Omit<
  UseRequestResult<unknown>,
  'data' | 'update'
> & {
  data: readonly TRow[];
  insert: (item: TRow, indexOrItem?: number | TRow) => Promise<void>;
  isLastPage: boolean;
  page: number;
  pageCount: number;
  pageSize: number;
  refresh: (pageOrItem?: number | TRow) => Promise<unknown>;
  reload: () => Promise<void>;
  remove: (...positions: (number | TRow)[]) => Promise<void>;
  removing: readonly number[];
  replace: (item: TRow, position: number | TRow) => Promise<void>;
  replacing: number | undefined;
  status: '' | 'loading' | 'inserting' | 'removing' | 'replacing';
  total: number;
  update: (states: {
    data?: readonly TRow[];
    page?: number;
    pageSize?: number;
  }) => void;
};

export type RequestStrategyError = RequestError;
