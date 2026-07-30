import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { RequestError } from '../client/error';
import { useRequest, type MethodHandler } from '../react/hooks';
import type { HookConfig, UseRequestResult } from '../types';

export type CaptchaConfig<TData> = Omit<HookConfig<TData>, 'immediate'> & {
  initialCountdown?: number;
};

export type CaptchaResult<TData> = UseRequestResult<TData> & {
  countdown: number;
};

export function useCaptcha<TData>(
  handler: MethodHandler<TData>,
  config: CaptchaConfig<TData> = {},
): CaptchaResult<TData> {
  const result = useRequest(handler, { ...config, immediate: false });
  const resultRef = useRef(result);
  resultRef.current = result;
  const deadline = useRef(0);
  const [deadlineAt, setDeadlineAt] = useState(0);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (deadlineAt <= Date.now()) return;
    const update = () => {
      const remaining = Math.max(
        0,
        Math.ceil((deadlineAt - Date.now()) / 1000),
      );
      setCountdown(remaining);
      if (remaining === 0) setDeadlineAt(0);
    };
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [deadlineAt]);

  const send = useCallback(
    async (...args: unknown[]) => {
      if (deadline.current > Date.now()) {
        throw new RequestError('Captcha countdown is active', {
          cause: undefined,
          code: 'CAPTCHA_COUNTDOWN',
          status: -1,
        });
      }
      const data = await resultRef.current.send(...args);
      const seconds = Math.max(0, config.initialCountdown ?? 60);
      deadline.current = Date.now() + seconds * 1000;
      setDeadlineAt(deadline.current);
      setCountdown(seconds);
      return data;
    },
    [config.initialCountdown],
  );

  return useMemo(
    () => ({ ...result, countdown, send }),
    [countdown, result, send],
  );
}
