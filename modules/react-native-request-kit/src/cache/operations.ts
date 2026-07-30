import type { Method } from '../client/Method';
import { getRuntime, keyHash } from '../client/runtime';
import type { MethodMatcher, RequestInstance } from '../types';

type CacheTarget = Method<unknown> | readonly Method<unknown>[] | MethodMatcher;

export async function invalidateCache(
  target: CacheTarget | RequestInstance,
  request?: RequestInstance,
): Promise<void> {
  if (isRequestInstance(target)) {
    await getRuntime(target).queryClient.invalidateQueries();
    return;
  }
  const methods = resolveMethods(target, request);
  await Promise.all(
    methods.map((method) =>
      getRuntime(method.request).queryClient.invalidateQueries({
        exact: true,
        queryKey: method.key,
      }),
    ),
  );
}

export function queryCache<TData>(method: Method<TData>): TData | undefined {
  return getRuntime(method.request).queryClient.getQueryData<TData>(method.key);
}

export function setCache<TData>(
  method: Method<TData>,
  updater: TData | ((current: TData | undefined) => TData | undefined),
): TData | undefined {
  return getRuntime(method.request).queryClient.setQueryData<TData>(
    method.key,
    updater,
  );
}

export function updateState<TData>(
  method: Method<TData>,
  updater:
    | TData
    | ((current: TData | undefined) => TData | undefined)
    | {
        data?: TData | ((current: TData | undefined) => TData | undefined);
        [key: string]: unknown;
      },
): boolean {
  const runtime = getRuntime(method.request);
  const stateCollection =
    typeof updater === 'object' &&
    updater !== null &&
    !Array.isArray(updater) &&
    'data' in updater
      ? (updater as Record<string, unknown>)
      : { data: updater };
  const data =
    typeof updater === 'object' &&
    updater !== null &&
    !Array.isArray(updater) &&
    'data' in updater
      ? updater.data
      : (updater as
          | TData
          | ((current: TData | undefined) => TData | undefined));
  if (data === undefined) {
    const updaters = runtime.stateUpdaters.get(keyHash(method.key));
    for (const stateUpdater of updaters ?? []) {
      stateUpdater(stateCollection);
    }
    return (updaters?.size ?? 0) > 0;
  }
  setCache(method, data);
  const updaters = runtime.stateUpdaters.get(keyHash(method.key));
  for (const stateUpdater of updaters ?? []) {
    stateUpdater(stateCollection);
  }
  return true;
}

function resolveMethods(
  target: CacheTarget,
  request?: RequestInstance,
): readonly Method<unknown>[] {
  if (Array.isArray(target)) {
    return target;
  }
  if (isMethod(target)) {
    return [target];
  }
  if (request === undefined) {
    throw new Error('A request instance is required when using a matcher');
  }
  return request.snapshots.match(target as MethodMatcher);
}

function isMethod(value: unknown): value is Method<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'send' in value &&
    'key' in value
  );
}

function isRequestInstance(value: unknown): value is RequestInstance {
  return (
    typeof value === 'object' &&
    value !== null &&
    'snapshots' in value &&
    'Request' in value
  );
}
