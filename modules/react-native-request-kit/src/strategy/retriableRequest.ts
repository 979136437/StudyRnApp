import { useCallback, useMemo, useRef, useState } from 'react';

import { RequestError, isRequestCancelled } from '../client/error';
import type { Method } from '../client/Method';
import { useRequest, type MethodHandler } from '../react/hooks';
import type { HookConfig, UseRequestResult } from '../types';

export type RetryBackoff = {
  delay?: number;
  endQuiver?: number;
  multiplier?: number;
  startQuiver?: number;
};

export type RetriableEvent = {
  error: RequestError;
  retryDelay: number;
  retryTimes: number;
};

export type RetriableRequestConfig<TData> = Omit<
  HookConfig<TData>,
  'middleware'
> & {
  backoff?: RetryBackoff;
  retry?: number | ((error: RequestError, ...args: unknown[]) => boolean);
};

export type RetriableRequestResult<TData> = UseRequestResult<TData> & {
  onFail(
    callback: (event: RetriableEvent) => void,
  ): RetriableRequestResult<TData>;
  onRetry(
    callback: (event: RetriableEvent) => void,
  ): RetriableRequestResult<TData>;
  stop(): void;
};

export function useRetriableRequest<TData>(
  handler: MethodHandler<TData>,
  config: RetriableRequestConfig<TData> = {},
): RetriableRequestResult<TData> {
  const stopped = useRef(false);
  const activeMethod = useRef<Method<TData> | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wake = useRef<(() => void) | undefined>(undefined);
  const retryListeners = useRef(new Set<(event: RetriableEvent) => void>());
  const failListeners = useRef(new Set<(event: RetriableEvent) => void>());
  const [lastError, setLastError] = useState<RequestError>();

  const result = useRequest(handler, {
    ...config,
    middleware: async ({ args, method }) => {
      activeMethod.current = method;
      stopped.current = false;
      setLastError(undefined);
      let retryTimes = 0;
      while (true) {
        try {
          return await method.executeOnce();
        } catch (value) {
          if (isRequestCancelled(value) && stopped.current) throw value;
          const error = normalize(value);
          setLastError(error);
          const shouldRetry =
            !stopped.current &&
            (typeof config.retry === 'function'
              ? config.retry(error, ...args)
              : retryTimes < (config.retry ?? 3));
          if (!shouldRetry) {
            const event = { error, retryDelay: 0, retryTimes };
            for (const listener of failListeners.current) listener(event);
            throw error;
          }
          retryTimes += 1;
          const retryDelay = resolveDelay(config.backoff, retryTimes);
          const event = { error, retryDelay, retryTimes };
          for (const listener of retryListeners.current) listener(event);
          await new Promise<void>((resolve) => {
            wake.current = resolve;
            timer.current = setTimeout(resolve, retryDelay);
          });
          timer.current = undefined;
          wake.current = undefined;
          if (stopped.current) {
            throw new RequestError('Retry was stopped', {
              cause: error,
              code: 'RETRY_STOPPED',
              status: -1,
            });
          }
        }
      }
    },
  });
  const resultRef = useRef<RetriableRequestResult<TData>>(null as never);

  const stop = useCallback(() => {
    stopped.current = true;
    activeMethod.current?.abort();
    if (timer.current !== undefined) clearTimeout(timer.current);
    wake.current?.();
  }, []);

  const enhanced = useMemo<RetriableRequestResult<TData>>(
    () => ({
      ...result,
      error: result.error ?? lastError,
      onFail: (callback) => {
        failListeners.current.add(callback);
        return resultRef.current;
      },
      onRetry: (callback) => {
        retryListeners.current.add(callback);
        return resultRef.current;
      },
      stop,
    }),
    [lastError, result, stop],
  );
  resultRef.current = enhanced;
  return enhanced;
}

function normalize(error: unknown): RequestError {
  return error instanceof RequestError
    ? error
    : new RequestError(
        error instanceof Error ? error.message : 'Unknown request error',
        {
          cause: error,
          code: 'UNKNOWN_ERROR',
          status: -1,
        },
      );
}

function resolveDelay(
  backoff: RetryBackoff | undefined,
  retryTimes: number,
): number {
  const delay =
    Math.max(0, backoff?.delay ?? 1000) *
    (backoff?.multiplier ?? 1) ** (retryTimes - 1);
  const lower = delay * Math.max(0, 1 - (backoff?.startQuiver ?? 0));
  const upper = delay * (1 + Math.max(0, backoff?.endQuiver ?? 0));
  return Math.round(lower + Math.random() * (upper - lower));
}
