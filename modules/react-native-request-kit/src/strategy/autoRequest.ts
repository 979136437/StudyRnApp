import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { useRequest, type MethodHandler } from '../react/hooks';
import type { HookConfig, UseRequestResult } from '../types';

export type AutoRequestConfig<TData> = HookConfig<TData> & {
  enableFocus?: boolean;
  enableNetwork?: boolean;
  enableVisibility?: boolean;
  pollingTime?: number;
  throttle?: number;
};

export type AutoRequestSubscriber = <TData>(
  notify: () => void,
  config: AutoRequestConfig<TData>,
) => void | (() => void);

export type NetworkSubscriber = AutoRequestSubscriber;

type AutoRequest = {
  <TData>(
    handler: MethodHandler<TData>,
    config?: AutoRequestConfig<TData>,
  ): UseRequestResult<TData>;
  onFocus: AutoRequestSubscriber;
  onNetwork: AutoRequestSubscriber;
  onPolling: AutoRequestSubscriber;
  onVisibility: AutoRequestSubscriber;
};

function useAutoRequestImpl<TData>(
  handler: MethodHandler<TData>,
  config: AutoRequestConfig<TData> = {},
): UseRequestResult<TData> {
  const result = useRequest(handler, config);
  const resultRef = useRef(result);
  resultRef.current = result;
  const configRef = useRef(config);
  configRef.current = config;
  const lastTriggeredAt = useRef(0);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const throttle = Math.max(0, config.throttle ?? 1000);

  useEffect(() => {
    const trigger = () => {
      const elapsed = Date.now() - lastTriggeredAt.current;
      const run = () => {
        lastTriggeredAt.current = Date.now();
        pendingTimer.current = undefined;
        void resultRef.current.send().catch(() => undefined);
      };
      if (elapsed >= throttle) {
        run();
      } else if (pendingTimer.current === undefined) {
        pendingTimer.current = setTimeout(run, throttle - elapsed);
      }
    };
    const cleanups: (() => void)[] = [];
    if (config.enableVisibility !== false) {
      addCleanup(
        cleanups,
        useAutoRequest.onVisibility(trigger, configRef.current),
      );
    }

    if (config.enableFocus !== false) {
      addCleanup(cleanups, useAutoRequest.onFocus(trigger, configRef.current));
    }

    if (config.enableNetwork !== false) {
      addCleanup(
        cleanups,
        useAutoRequest.onNetwork(trigger, configRef.current),
      );
    }

    const pollingTime = Math.max(0, config.pollingTime ?? 0);
    if (pollingTime > 0) {
      addCleanup(
        cleanups,
        useAutoRequest.onPolling(trigger, configRef.current),
      );
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
      if (pendingTimer.current !== undefined) {
        clearTimeout(pendingTimer.current);
        pendingTimer.current = undefined;
      }
    };
  }, [
    config.enableFocus,
    config.enableNetwork,
    config.enableVisibility,
    config.pollingTime,
    throttle,
  ]);

  return result;
}

function addCleanup(
  cleanups: (() => void)[],
  cleanup: void | (() => void),
): void {
  if (cleanup !== undefined) cleanups.push(cleanup);
}

const defaultOnVisibility: AutoRequestSubscriber = (notify) => {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') notify();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }

  let previousState = AppState.currentState;
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active' && previousState !== 'active') notify();
    previousState = state;
  });
  return () => subscription.remove();
};

const defaultOnFocus: AutoRequestSubscriber = (notify) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return () => undefined;
  }
  window.addEventListener('focus', notify);
  return () => window.removeEventListener('focus', notify);
};

const defaultOnNetwork: AutoRequestSubscriber = (notify) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return () => undefined;
  }
  window.addEventListener('online', notify);
  return () => window.removeEventListener('online', notify);
};

const defaultOnPolling: AutoRequestSubscriber = (notify, config) => {
  const pollingTime = Math.max(0, config.pollingTime ?? 0);
  if (pollingTime === 0) return () => undefined;
  const timer = setInterval(notify, pollingTime);
  return () => clearInterval(timer);
};

export const useAutoRequest = Object.assign(useAutoRequestImpl, {
  onFocus: defaultOnFocus,
  onNetwork: defaultOnNetwork,
  onPolling: defaultOnPolling,
  onVisibility: defaultOnVisibility,
}) as AutoRequest;
