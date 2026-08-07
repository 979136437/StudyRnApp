import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from '@tanstack/react-query';

import { createFetchRequestAdapter } from '../adapter/fetch';
import type { RequestAdapter } from '../adapter/types';
import type {
  AnyMethod,
  CreateRequestOptions,
  HttpMethod,
  MethodConfig,
  MethodMatcher,
  RequestInstance,
  SnapshotCollection,
} from '../types';
import { Method } from '../core/method';
import { attachRuntime, getRuntime, type Runtime } from '../core/runtime';

const MAX_SNAPSHOTS = 1000;
const DEFAULT_MAX_AGE = 24 * 60 * 60 * 1000;

export function createRequest<TTransformed = unknown>(
  options?: CreateRequestOptions<Response, Headers, TTransformed> & {
    requestAdapter?: undefined;
  },
): RequestInstance<Response, Headers, TTransformed>;
export function createRequest<
  TResponse,
  TResponseHeaders,
  TTransformed = TResponse,
>(
  options: CreateRequestOptions<TResponse, TResponseHeaders, TTransformed> & {
    requestAdapter: RequestAdapter<TResponse, TResponseHeaders>;
  },
): RequestInstance<TResponse, TResponseHeaders, TTransformed>;
export function createRequest<TResponse, TResponseHeaders, TTransformed>(
  options: CreateRequestOptions<TResponse, TResponseHeaders, TTransformed> = {},
): RequestInstance<TResponse, TResponseHeaders, TTransformed> {
  let request: RequestInstance<TResponse, TResponseHeaders, TTransformed>;
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { gcTime: DEFAULT_MAX_AGE, retry: false },
    },
  });
  const runtime: Runtime = {
    activeRequests: new Map(),
    destroyed: false,
    options,
    persistOptions:
      options.StoragePersister === undefined
        ? undefined
        : {
            buster: '1',
            dehydrateOptions: {
              shouldDehydrateQuery: (query: {
                meta?: Record<string, unknown>;
              }) =>
                defaultShouldDehydrateQuery(query as never) &&
                query.meta?.persist === true,
            },
            maxAge: DEFAULT_MAX_AGE,
            persister: options.StoragePersister,
          },
    queryClient,
    requestAdapter: (options.requestAdapter ??
      createFetchRequestAdapter()) as RequestAdapter<any, any>,
    snapshots: [],
    stateUpdaters: new Map(),
  };

  const createMethod = <TData, TBody>(
    type: HttpMethod,
    url: string,
    data?: TBody,
    config?: MethodConfig<TData, TTransformed, TResponseHeaders>,
  ) => {
    const method = new Method<TData, TResponse, TResponseHeaders, TTransformed>(
      request,
      type,
      url,
      data,
      config,
    );
    runtime.snapshots.push(method as AnyMethod);
    if (runtime.snapshots.length > MAX_SNAPSHOTS) {
      runtime.snapshots.shift();
    }
    return method;
  };

  const snapshots: SnapshotCollection = {
    match(matcher: MethodMatcher, exact = false) {
      const matches = matchSnapshots(runtime.snapshots, matcher);
      return exact ? matches.at(-1) : matches;
    },
  } as SnapshotCollection;

  request = {
    Delete: <TData, TBody>(
      url: string,
      data?: TBody,
      config?: MethodConfig<TData, TTransformed, TResponseHeaders>,
    ) => createMethod('DELETE', url, data, config),
    Get: <TData>(
      url: string,
      config?: MethodConfig<TData, TTransformed, TResponseHeaders>,
    ) => createMethod('GET', url, undefined, config),
    Head: <TData>(
      url: string,
      config?: MethodConfig<TData, TTransformed, TResponseHeaders>,
    ) => createMethod('HEAD', url, undefined, config),
    Options: <TData>(
      url: string,
      config?: MethodConfig<TData, TTransformed, TResponseHeaders>,
    ) => createMethod('OPTIONS', url, undefined, config),
    Patch: <TData, TBody>(
      url: string,
      data?: TBody,
      config?: MethodConfig<TData, TTransformed, TResponseHeaders>,
    ) => createMethod('PATCH', url, data, config),
    Post: <TData, TBody>(
      url: string,
      data?: TBody,
      config?: MethodConfig<TData, TTransformed, TResponseHeaders>,
    ) => createMethod('POST', url, data, config),
    Put: <TData, TBody>(
      url: string,
      data?: TBody,
      config?: MethodConfig<TData, TTransformed, TResponseHeaders>,
    ) => createMethod('PUT', url, data, config),
    Request: <TData, TBody>(
      type: HttpMethod,
      url: string,
      data?: TBody,
      config?: MethodConfig<TData, TTransformed, TResponseHeaders>,
    ) => createMethod(type, url, data, config),
    clear: async () => {
      queryClient.clear();
      await options.StoragePersister?.removeClient();
    },
    destroy: () => {
      const attached = getRuntime(request);
      for (const activeRequests of attached.activeRequests.values()) {
        for (const activeRequest of activeRequests) {
          activeRequest.abort();
        }
      }
      attached.activeRequests.clear();
      attached.queryClient.clear();
      attached.snapshots.length = 0;
      attached.stateUpdaters.clear();
      attached.destroyed = true;
    },
    snapshots,
  };

  attachRuntime(request, runtime);
  return request;
}

function matchSnapshots(
  snapshots: readonly AnyMethod[],
  matcher: MethodMatcher,
): AnyMethod[] {
  const matchName = (method: AnyMethod, name: string | RegExp) =>
    typeof name === 'string'
      ? method.name === name
      : method.name !== undefined && name.test(method.name);

  if (typeof matcher === 'string' || matcher instanceof RegExp) {
    return snapshots.filter((method) => matchName(method, matcher));
  }

  const byName =
    matcher.name === undefined
      ? [...snapshots]
      : snapshots.filter((method) => matchName(method, matcher.name!));
  return matcher.filter === undefined
    ? byName
    : byName.filter((method, index, methods) =>
        matcher.filter?.(method, index, methods),
      );
}
