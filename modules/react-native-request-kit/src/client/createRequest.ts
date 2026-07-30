import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from '@tanstack/react-query';
import ky, { type Options as KyOptions } from 'ky';

import type {
  CreateRequestOptions,
  HttpMethod,
  MethodConfig,
  MethodMatcher,
  RequestInstance,
  SnapshotCollection,
} from '../types';
import { Method } from './Method';
import { attachRuntime, getRuntime, type Runtime } from './runtime';

const MAX_SNAPSHOTS = 1000;
const DEFAULT_MAX_AGE = 24 * 60 * 60 * 1000;

export function createRequest(
  options: CreateRequestOptions = {},
): RequestInstance {
  let request: RequestInstance;
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { gcTime: DEFAULT_MAX_AGE, retry: false },
    },
  });
  const clientOptions: KyOptions = {
    headers: options.headers,
    retry: 0,
    timeout: options.timeout ?? 15_000,
  };

  if (options.baseUrl) {
    clientOptions.baseUrl = `${options.baseUrl.replace(/\/+$/, '')}/`;
  }
  const runtime: Runtime = {
    client: ky.create(clientOptions),
    controllers: new Map(),
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
    snapshots: [],
    stateUpdaters: new Map(),
  };

  const createMethod = <TData, TBody>(
    type: HttpMethod,
    url: string,
    data?: TBody,
    config?: MethodConfig<TData>,
  ) => {
    const method = new Method<TData>(request, type, url, data, config);
    runtime.snapshots.push(method as Method<unknown>);
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
      config?: MethodConfig<TData>,
    ) => createMethod('DELETE', url, data, config),
    Get: <TData>(url: string, config?: MethodConfig<TData>) =>
      createMethod('GET', url, undefined, config),
    Head: <TData>(url: string, config?: MethodConfig<TData>) =>
      createMethod('HEAD', url, undefined, config),
    Options: <TData>(url: string, config?: MethodConfig<TData>) =>
      createMethod('OPTIONS', url, undefined, config),
    Patch: <TData, TBody>(
      url: string,
      data?: TBody,
      config?: MethodConfig<TData>,
    ) => createMethod('PATCH', url, data, config),
    Post: <TData, TBody>(
      url: string,
      data?: TBody,
      config?: MethodConfig<TData>,
    ) => createMethod('POST', url, data, config),
    Put: <TData, TBody>(
      url: string,
      data?: TBody,
      config?: MethodConfig<TData>,
    ) => createMethod('PUT', url, data, config),
    Request: <TData, TBody>(
      type: HttpMethod,
      url: string,
      data?: TBody,
      config?: MethodConfig<TData>,
    ) => createMethod(type, url, data, config),
    clear: async () => {
      queryClient.clear();
      await options.StoragePersister?.removeClient();
    },
    destroy: () => {
      const attached = getRuntime(request);
      for (const controllers of attached.controllers.values()) {
        for (const controller of controllers) {
          controller.abort();
        }
      }
      attached.controllers.clear();
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
  snapshots: readonly Method<unknown>[],
  matcher: MethodMatcher,
): Method<unknown>[] {
  const matchName = (method: Method<unknown>, name: string | RegExp) =>
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
