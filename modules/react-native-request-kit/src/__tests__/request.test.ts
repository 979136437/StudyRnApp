import { afterEach, describe, expect, it, vi } from 'vitest';

import { invalidateCache, queryCache, setCache } from '../cache/operations';
import { createRequest } from '../client/createRequest';
import { isRequestCancelled } from '../client/error';
import { getRuntime } from '../client/runtime';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('createRequest', () => {
  it('applies request and response interceptors', async () => {
    const fetchMock = vi.fn(async (request: Request) => {
      expect(request.url).toBe('https://api.example.com/todos?page=1');
      expect(request.headers.get('authorization')).toBe('Bearer token');
      return Response.json({ data: [{ id: 1 }] });
    });
    vi.stubGlobal('fetch', fetchMock);
    const request = createRequest({
      baseUrl: 'https://api.example.com',
      beforeRequest: async (original) => {
        const headers = new Headers(original.headers);
        headers.set('Authorization', 'Bearer token');
        return new Request(original, { headers });
      },
      responded: {
        onSuccess: async (response) =>
          (await response.json()) as { data: { id: number }[] },
      },
    });

    await expect(
      request.Get<{ data: { id: number }[] }>('todos', {
        params: { page: 1 },
      }),
    ).resolves.toEqual({ data: [{ id: 1 }] });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('uses fresh, stale, and expired SWR windows', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    let version = 0;
    const fetchMock = vi.fn(async () => Response.json({ version: ++version }));
    vi.stubGlobal('fetch', fetchMock);
    const request = createRequest();
    const method = request.Get<{ version: number }>('https://api.test/data');

    await expect(method.send()).resolves.toEqual({ version: 1 });
    await expect(method.send()).resolves.toEqual({ version: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-01-01T00:06:00Z'));
    await expect(method.send()).resolves.toEqual({ version: 1 });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(queryCache(method)).toEqual({ version: 2 }));

    vi.setSystemTime(new Date('2026-01-02T01:00:00Z'));
    await expect(method.send()).resolves.toEqual({ version: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('supports force, cache operations, and snapshots', async () => {
    let version = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ version: ++version })),
    );
    const request = createRequest();
    const method = request.Get<{ version: number }>('https://api.test/data', {
      name: 'todo-list',
    });

    await method.send();
    await expect(method.send(true)).resolves.toEqual({ version: 2 });
    setCache(method, { version: 10 });
    expect(queryCache(method)).toEqual({ version: 10 });
    expect(request.snapshots.match('todo-list', true)).toBe(method);
    await invalidateCache(method);
    expect(
      getRuntime(request).queryClient.getQueryState(method.key)?.isInvalidated,
    ).toBe(true);
  });

  it('honors absolute expiration dates without expiring early', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    let version = 0;
    const fetchMock = vi.fn(async () => Response.json({ version: ++version }));
    vi.stubGlobal('fetch', fetchMock);
    const request = createRequest();
    const method = request.Get<{ version: number }>('https://api.test/date', {
      cacheFor: new Date('2026-01-01T01:00:00Z'),
    });

    await expect(method.send()).resolves.toEqual({ version: 1 });
    vi.setSystemTime(new Date('2026-01-01T00:45:00Z'));
    await expect(method.send()).resolves.toEqual({ version: 1 });
    expect(fetchMock).toHaveBeenCalledOnce();

    vi.setSystemTime(new Date('2026-01-01T01:00:00Z'));
    await expect(method.send()).resolves.toEqual({ version: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries idempotent requests when request sharing is disabled', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const request = createRequest({ shareRequest: false });

    await expect(
      request.Get<{ ok: boolean }>('https://api.test/retry').send(true),
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('normalizes errors and allows a fallback response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { code: 'NOT_FOUND', message: 'Missing' },
          { status: 404 },
        ),
      ),
    );
    const strictRequest = createRequest();
    await expect(
      strictRequest.Get('https://api.test/missing').send(true),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Missing',
      status: 404,
    });

    const fallbackRequest = createRequest({
      responded: {
        onError: async (error) => ({ fallback: true, status: error.status }),
      },
    });
    await expect(
      fallbackRequest
        .Get<{ fallback: boolean; status: number }>('https://api.test/missing')
        .send(true),
    ).resolves.toEqual({ fallback: true, status: 404 });
  });

  it('aborts active requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (request: Request) =>
          new Promise<Response>((_resolve, reject) => {
            request.signal.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }),
      ),
    );
    const request = createRequest();
    const method = request.Get('https://api.test/slow');
    const pending = method.send(true);
    method.abort();
    await expect(pending).rejects.toSatisfy(isRequestCancelled);
  });
});
