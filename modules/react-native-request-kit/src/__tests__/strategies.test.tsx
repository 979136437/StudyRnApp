import { QueryClientProvider } from '@tanstack/react-query';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRequest } from '../client/createRequest';
import { getRuntime } from '../client/runtime';
import { createServerTokenAuthentication } from '../strategy/authentication';
import { useAutoRequest } from '../strategy/autoRequest';
import { useCaptcha, type CaptchaResult } from '../strategy/captcha';
import {
  useRetriableRequest,
  type RetriableRequestResult,
} from '../strategy/retriableRequest';
import { useUploader, type UploaderResult } from '../strategy/uploader';
import type { UseRequestResult } from '../types';

vi.mock('react-native', () => ({
  AppState: {
    addEventListener: () => ({ remove: vi.fn() }),
    currentState: 'active',
  },
  Platform: { OS: 'native' },
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const defaultAutoRequestSubscribers = {
  onFocus: useAutoRequest.onFocus,
  onNetwork: useAutoRequest.onNetwork,
  onPolling: useAutoRequest.onPolling,
  onVisibility: useAutoRequest.onVisibility,
};

afterEach(() => {
  Object.assign(useAutoRequest, defaultAutoRequestSubscribers);
  useUploader.selectFile = undefined;
  useUploader.createLocalLink = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('request strategies', () => {
  it('refreshes server tokens once for concurrent requests and replays them', async () => {
    let token = 'old';
    const refreshToken = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      token = 'new';
    });
    const authentication = createServerTokenAuthentication({
      assignToken: (method) => {
        method.headers.set('Authorization', `Bearer ${token}`);
      },
      isResponseExpired: (response) => response.status === 401,
      refreshToken,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) =>
        new Headers(init?.headers).get('authorization') === 'Bearer new'
          ? Response.json({ ok: true })
          : Response.json({ message: 'expired' }, { status: 401 }),
      ),
    );
    const request = createRequest({
      beforeRequest: authentication.onAuthRequired(),
      responded: authentication.onResponseRefreshToken(),
    });

    await expect(
      Promise.all([
        request.Get<{ ok: boolean }>('https://api.test/a').send(true),
        request.Get<{ ok: boolean }>('https://api.test/b').send(true),
      ]),
    ).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(refreshToken).toHaveBeenCalledOnce();
  });

  it('does not retry a request after token refresh fails', async () => {
    const refreshToken = vi.fn(async () => {
      throw new Error('refresh unavailable');
    });
    const authentication = createServerTokenAuthentication({
      assignToken: () => undefined,
      isResponseExpired: (response) => response.status === 401,
      refreshToken,
    });
    const fetchMock = vi.fn(async () =>
      Response.json({ message: 'expired' }, { status: 401 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const request = createRequest({
      beforeRequest: authentication.onAuthRequired(),
      responded: authentication.onResponseRefreshToken(),
    });

    await expect(
      request.Get('https://api.test/protected').send(true),
    ).rejects.toMatchObject({ code: 'AUTH_REFRESH_FAILED' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(refreshToken).toHaveBeenCalledOnce();
  });

  it('transforms a successful token replay only once', async () => {
    let token = 'old';
    const transform = vi.fn((data: { value: number }) => ({
      value: data.value + 1,
    }));
    const authentication = createServerTokenAuthentication({
      assignToken: (method) => {
        method.headers.set('Authorization', `Bearer ${token}`);
      },
      isResponseExpired: async (response) =>
        response instanceof Response &&
        ((await response.clone().json()) as { code?: string }).code ===
          'expired',
      refreshToken: () => {
        token = 'new';
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) =>
        new Headers(init?.headers).get('authorization') === 'Bearer new'
          ? Response.json({ value: 1 })
          : Response.json({ code: 'expired' }),
      ),
    );
    const request = createRequest({
      beforeRequest: authentication.onAuthRequired(),
      responded: authentication.onResponseRefreshToken({
        onSuccess: async (response) =>
          (await response.json()) as { value: number },
      }),
    });

    await expect(
      request.Get<{ value: number }>('https://api.test/protected', {
        transform,
      }),
    ).resolves.toEqual({ value: 2 });
    expect(transform).toHaveBeenCalledOnce();
  });

  it('counts down only after a successful captcha request', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ sent: true })),
    );
    const request = createRequest();
    const queryClient = getRuntime(request).queryClient;
    let hook: CaptchaResult<{ sent: boolean }> | undefined;
    let renderer: ReactTestRenderer;

    function Fixture() {
      hook = useCaptcha(() => request.Post('https://api.test/captcha'), {
        initialCountdown: 2,
      });
      return null;
    }

    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <Fixture />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await hook!.send();
    });
    expect(hook?.countdown).toBe(2);
    await expect(hook!.send()).rejects.toMatchObject({
      code: 'CAPTCHA_COUNTDOWN',
    });
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(hook?.countdown).toBe(0);
    act(() => renderer!.unmount());
  });

  it('retries one network attempt per round and emits retry events', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const request = createRequest();
    const queryClient = getRuntime(request).queryClient;
    let hook: RetriableRequestResult<{ ok: boolean }> | undefined;
    let renderer: ReactTestRenderer;

    function Fixture() {
      hook = useRetriableRequest(
        () => request.Get('https://api.test/retry', { cacheFor: null }),
        { backoff: { delay: 0 }, immediate: false, retry: 2 },
      );
      return null;
    }

    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <Fixture />
        </QueryClientProvider>,
      );
    });
    const retries = vi.fn();
    hook!.onRetry(retries);
    await act(async () => expect(hook!.send()).resolves.toEqual({ ok: true }));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(retries).toHaveBeenCalledTimes(2);
    expect(retries.mock.calls[1]?.[0]).toMatchObject({ retryTimes: 2 });
    act(() => renderer!.unmount());
  });

  it('normalizes uploader files and updates successful item state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ id: 1 })),
    );
    const request = createRequest();
    const queryClient = getRuntime(request).queryClient;
    let hook: UploaderResult<{ id: number }> | undefined;
    let renderer: ReactTestRenderer;

    function Fixture() {
      hook = useUploader(() => request.Post('https://api.test/upload'), {
        mode: 'each',
      });
      return null;
    }

    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <Fixture />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await hook!.appendFiles([
        { uri: 'file:///photo.jpg', name: 'photo.jpg', type: 'image/jpeg' },
      ]);
    });
    expect(hook?.file).toMatchObject({
      name: 'photo.jpg',
      preview: 'file:///photo.jpg',
      status: 0,
    });
    await act(async () => expect(hook!.upload()).resolves.toEqual([{ id: 1 }]));
    expect(hook?.file).toMatchObject({ response: { id: 1 }, status: 2 });
    expect(hook?.successCount).toBe(1);
    act(() => renderer!.unmount());
  });

  it('polls automatic requests and cleans the timer on unmount', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const request = createRequest();
    const queryClient = getRuntime(request).queryClient;
    let hook: UseRequestResult<{ ok: boolean }> | undefined;
    let renderer: ReactTestRenderer;

    function Fixture() {
      hook = useAutoRequest(
        request.Get('https://api.test/poll', { cacheFor: null }),
        {
          immediate: false,
          pollingTime: 100,
          throttle: 0,
        },
      );
      return null;
    }

    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <Fixture />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });
    expect(hook?.data).toEqual({ ok: true });
    const calls = fetchMock.mock.calls.length;
    act(() => renderer!.unmount());
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(fetchMock).toHaveBeenCalledTimes(calls);
  });

  it('supports custom automatic request subscribers and cleans each one', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const request = createRequest();
    const queryClient = getRuntime(request).queryClient;
    const notifies: (() => void)[] = [];
    const cleanups = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
    const subscribers = [
      'onVisibility',
      'onFocus',
      'onNetwork',
      'onPolling',
    ] as const;
    subscribers.forEach((name, index) => {
      useAutoRequest[name] = (notify, config) => {
        expect(config.pollingTime).toBe(100);
        notifies.push(notify);
        return cleanups[index];
      };
    });
    let renderer: ReactTestRenderer;

    function Fixture() {
      useAutoRequest(
        request.Get('https://api.test/custom-auto', { cacheFor: null }),
        { immediate: false, pollingTime: 100, throttle: 0 },
      );
      return null;
    }

    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <Fixture />
        </QueryClientProvider>,
      );
    });
    expect(notifies).toHaveLength(4);
    await act(async () => {
      for (const notify of notifies) notify();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    act(() => renderer!.unmount());
    for (const cleanup of cleanups) expect(cleanup).toHaveBeenCalledOnce();
  });
});

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
