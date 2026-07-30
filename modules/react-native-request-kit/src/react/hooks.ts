import { useQuery } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DependencyList,
} from 'react';

import { queryCache, setCache } from '../cache/operations';
import { RequestError } from '../client/error';
import { Method } from '../client/Method';
import { EMPTY_PROGRESS, getRuntime, keyHash } from '../client/runtime';
import type {
  FrontStates,
  HookCompleteEvent,
  HookConfig,
  HookErrorEvent,
  HookEvent,
  ProgressInfo,
  UseFetcherResult,
  UseRequestResult,
  WatcherHookConfig,
} from '../types';

export type MethodHandler<TData> =
  | Method<TData>
  | ((...args: unknown[]) => Method<TData>);

type ListenerSets<TData> = {
  complete: Set<(event: HookCompleteEvent<TData>) => void>;
  error: Set<(event: HookErrorEvent<TData>) => void>;
  success: Set<(event: HookEvent<TData>) => void>;
};

export function useRequest<TData>(
  handler: MethodHandler<TData>,
  config: HookConfig<TData> = {},
): UseRequestResult<TData> {
  const isDirectMethod = handler instanceof Method;
  const [factoryMethod, setFactoryMethod] = useState<Method<TData> | undefined>(
    () =>
      isDirectMethod
        ? undefined
        : config.immediate === false
          ? undefined
          : handler(),
  );
  const method = isDirectMethod ? handler : factoryMethod;
  const disabledKey = useRef(['request-hook-disabled', Symbol()]).current;
  const listeners = useRef<ListenerSets<TData>>({
    complete: new Set(),
    error: new Set(),
    success: new Set(),
  });
  const configRef = useRef(config);
  configRef.current = config;
  const resultRef = useRef<UseRequestResult<TData>>(null as never);
  const [manualData, setManualData] = useState<TData | undefined>(
    config.initialData,
  );
  const [manualError, setManualError] = useState<RequestError>();
  const [manualLoading, setManualLoading] = useState(false);
  const [downloading, setDownloading] = useState<ProgressInfo>(EMPTY_PROGRESS);
  const [uploading, setUploading] = useState<ProgressInfo>(EMPTY_PROGRESS);
  const [managedStates, setManagedStates] = useState(
    config.managedStates ?? {},
  );
  const queryEnabled =
    method !== undefined &&
    method.cacheSettings().enabled &&
    config.immediate !== false;
  const queryOptions = method?.queryOptions();
  const query = useQuery<TData, RequestError>({
    ...queryOptions,
    enabled: queryEnabled,
    queryFn:
      method === undefined
        ? async () => {
            throw new Error('No request method is available');
          }
        : ({ signal }) =>
            executeWithMiddleware(method, [], configRef.current, signal),
    queryKey: method?.key ?? disabledKey,
  });
  const lastEventAt = useRef(0);
  const immediateWriteKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (
      method === undefined ||
      query.dataUpdatedAt === 0 ||
      query.dataUpdatedAt === lastEventAt.current ||
      query.data === undefined
    ) {
      return;
    }
    lastEventAt.current = query.dataUpdatedAt;
    emitSuccess(listeners.current, method, [], query.data, false);
  }, [method, query.data, query.dataUpdatedAt]);

  useEffect(() => {
    if (
      method === undefined ||
      query.errorUpdatedAt === 0 ||
      query.errorUpdatedAt === lastEventAt.current ||
      query.error === null
    ) {
      return;
    }
    lastEventAt.current = query.errorUpdatedAt;
    emitError(listeners.current, method, [], query.error);
  }, [method, query.error, query.errorUpdatedAt]);

  const run = useCallback(
    async (nextMethod: Method<TData>, args: readonly unknown[]) => {
      const force =
        typeof configRef.current.force === 'function'
          ? configRef.current.force(...args)
          : configRef.current.force === true;
      setManualLoading(true);
      setManualError(undefined);
      nextMethod.onDownload(setDownloading).onUpload(setUploading);
      const hadCache =
        nextMethod.cacheSettings().enabled &&
        queryCache(nextMethod) !== undefined;
      try {
        const data = await executeWithMiddleware(
          nextMethod,
          args,
          configRef.current,
          undefined,
          force,
        );
        setManualData(data);
        emitSuccess(listeners.current, nextMethod, args, data, hadCache);
        return data;
      } catch (error) {
        const normalized =
          error instanceof RequestError
            ? error
            : new RequestError(
                error instanceof Error
                  ? error.message
                  : 'Unknown request error',
                { cause: error, code: 'UNKNOWN_ERROR', status: -1 },
              );
        setManualError(normalized);
        emitError(listeners.current, nextMethod, args, normalized);
        throw normalized;
      } finally {
        setManualLoading(false);
      }
    },
    [],
  );

  const send = useCallback(
    async (...args: unknown[]) => {
      const nextMethod = isDirectMethod ? handler : handler(...args);
      if (!isDirectMethod) {
        setFactoryMethod(nextMethod);
      }
      return run(nextMethod, args);
    },
    [handler, isDirectMethod, run],
  );

  useEffect(() => {
    if (
      method === undefined ||
      method.cacheSettings().enabled ||
      config.immediate === false
    ) {
      return;
    }
    const hash = keyHash(method.key);
    if (immediateWriteKey.current === hash) {
      return;
    }
    immediateWriteKey.current = hash;
    void run(method, []);
  }, [config.immediate, method, run]);

  const abort = useCallback(() => method?.abort(), [method]);
  const update = useCallback(
    (states: FrontStates<TData>) => {
      if (states.data !== undefined) {
        if (method?.cacheSettings().enabled) {
          setCache(method, states.data);
        }
        setManualData((current) =>
          typeof states.data === 'function'
            ? (states.data as (value: TData | undefined) => TData | undefined)(
                current,
              )
            : states.data,
        );
      }
      if (states.error !== undefined) {
        setManualError(states.error);
      }
      if (states.loading !== undefined) {
        setManualLoading(states.loading);
      }
      setManagedStates((current) => ({ ...current, ...states }));
    },
    [method],
  );

  useEffect(() => {
    if (method === undefined) {
      return;
    }
    const runtime = getRuntime(method.request);
    const hash = keyHash(method.key);
    const updaters = runtime.stateUpdaters.get(hash) ?? new Set();
    const stateUpdater = (states: Record<string, unknown>) =>
      update(states as FrontStates<TData>);
    updaters.add(stateUpdater);
    runtime.stateUpdaters.set(hash, updaters);
    return () => {
      updaters.delete(stateUpdater);
      if (updaters.size === 0) {
        runtime.stateUpdaters.delete(hash);
      }
    };
  }, [method, update]);

  const data = method?.cacheSettings().enabled
    ? (query.data ?? manualData)
    : manualData;
  const error = method?.cacheSettings().enabled
    ? (query.error ?? manualError)
    : manualError;
  const fetching = query.isFetching || manualLoading;
  const loading = data === undefined && fetching;
  const result = useMemo<UseRequestResult<TData>>(
    () => ({
      ...managedStates,
      abort,
      data,
      downloading,
      error,
      fetching,
      loading,
      onComplete: (callback) => {
        listeners.current.complete.add(callback);
        return resultRef.current;
      },
      onError: (callback) => {
        listeners.current.error.add(callback);
        return resultRef.current;
      },
      onSuccess: (callback) => {
        listeners.current.success.add(callback);
        return resultRef.current;
      },
      send,
      update,
      uploading,
    }),
    [
      abort,
      data,
      downloading,
      error,
      fetching,
      loading,
      managedStates,
      send,
      update,
      uploading,
    ],
  );
  resultRef.current = result;
  return result;
}

export function useWatcher<TData>(
  handler: MethodHandler<TData>,
  watchingStates: DependencyList,
  config: WatcherHookConfig<TData> = {},
): UseRequestResult<TData> {
  const result = useRequest(handler, { ...config, immediate: false });
  const mounted = useRef(false);
  const previous = useRef<DependencyList>(watchingStates);

  useEffect(() => {
    const changed = watchingStates
      .map((value, index) => !Object.is(value, previous.current[index]))
      .map((value, index) => (value ? index : -1))
      .filter((index) => index >= 0);
    previous.current = watchingStates;

    if (!mounted.current) {
      mounted.current = true;
      if (config.immediate !== true) {
        return;
      }
    } else if (changed.length === 0) {
      return;
    }

    if (config.abortLast !== false) {
      result.abort();
    }
    const debounce = config.debounce;
    const delay =
      typeof debounce === 'number'
        ? debounce
        : Math.max(0, ...changed.map((index) => debounce?.[index] ?? 0));
    const timer = setTimeout(() => void result.send(), delay);
    return () => clearTimeout(timer);
  });

  return result;
}

export function useFetcher<TData>(
  config: HookConfig<TData> = {},
): UseFetcherResult<TData> {
  const result = useRequest<TData>(
    (...args) => {
      const selected = args[0] as Method<TData> | undefined;
      if (selected === undefined) {
        throw new Error('useFetcher.fetch requires a Method instance');
      }
      return selected;
    },
    {
      ...config,
      force: (...args) =>
        args[1] === true ||
        (typeof config.force === 'function'
          ? config.force(...args)
          : config.force === true),
      immediate: false,
    },
  );
  const fetch = useCallback(
    async (nextMethod: Method<TData>, force = false) => {
      return result.send(nextMethod, force);
    },
    [result],
  );

  return { ...result, fetch };
}

async function executeWithMiddleware<TData>(
  method: Method<TData>,
  args: readonly unknown[],
  config: HookConfig<TData>,
  signal?: AbortSignal,
  force = false,
): Promise<TData> {
  const next = () =>
    signal === undefined ? method.send(force) : method.execute(signal);
  if (config.middleware === undefined) {
    return next();
  }
  return config.middleware(
    {
      abort: () => method.abort(),
      args,
      method,
      send: next,
    },
    next,
  );
}

function emitSuccess<TData>(
  listeners: ListenerSets<TData>,
  method: Method<TData>,
  args: readonly unknown[],
  data: TData,
  fromCache: boolean,
): void {
  const event = { args, data, fromCache, method };
  for (const listener of listeners.success) {
    listener(event);
  }
  for (const listener of listeners.complete) {
    listener({ ...event, status: 'success' });
  }
}

function emitError<TData>(
  listeners: ListenerSets<TData>,
  method: Method<TData>,
  args: readonly unknown[],
  error: RequestError,
): void {
  const event = { args, error, method };
  for (const listener of listeners.error) {
    listener(event);
  }
  for (const listener of listeners.complete) {
    listener({ ...event, status: 'error' });
  }
}
