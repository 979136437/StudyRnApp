import {
  AxiosError,
  CanceledError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAxiosRequestAdapter } from '../adapter/axios';
import { createFetchRequestAdapter } from '../adapter/fetch';
import type { RequestElements } from '../adapter/types';
import { isRequestCancelled } from '../core/request-error';

afterEach(() => {
  vi.useRealTimers();
});

describe('request adapters', () => {
  it('uses injected fetch options and encodes object bodies as JSON', async () => {
    const fetchImplementation = vi.fn(
      async (url: string, init?: RequestInit) => {
        expect(url).toBe('https://api.test/items');
        expect(init?.credentials).toBe('include');
        expect(init?.method).toBe('POST');
        expect(init?.body).toBe('{"name":"Ada"}');
        expect(new Headers(init?.headers).get('content-type')).toBe(
          'application/json',
        );
        return Response.json({ ok: true });
      },
    );
    const controls = createFetchRequestAdapter({
      credentials: 'include',
      fetch: fetchImplementation,
    })(createElements('POST', { name: 'Ada' }), undefined as never);

    await expect(
      controls.response().then((response) => response.json()),
    ).resolves.toEqual({ ok: true });
    await controls.headers();
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it('reports fetch download progress while preserving response metadata', async () => {
    const encoder = new TextEncoder();
    const rawResponse = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('ab'));
          controller.enqueue(encoder.encode('cd'));
          controller.close();
        },
      }),
      { headers: { 'Content-Length': '4' } },
    );
    Object.defineProperty(rawResponse, 'url', {
      configurable: true,
      value: 'https://api.test/file',
    });
    const controls = createFetchRequestAdapter({
      fetch: async () => rawResponse,
    })(createElements('GET'), undefined as never);
    const progress = vi.fn();
    controls.onDownload?.(progress);

    const response = await controls.response();
    expect(response.url).toBe('https://api.test/file');
    await expect(response.text()).resolves.toBe('abcd');
    expect(progress).toHaveBeenLastCalledWith(4, 4);
  });

  it('does not invent fetch progress without a response stream', async () => {
    const controls = createFetchRequestAdapter({
      fetch: async () => new Response(null),
    })(createElements('GET'), undefined as never);
    const progress = vi.fn();
    controls.onDownload?.(progress);

    await controls.response();
    expect(progress).not.toHaveBeenCalled();
  });

  it('reports loaded fetch bytes without inventing an unknown total', async () => {
    const rawResponse = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      }),
    );
    const controls = createFetchRequestAdapter({
      fetch: async () => rawResponse,
    })(createElements('GET'), undefined as never);
    const progress = vi.fn();
    controls.onDownload?.(progress);

    await (await controls.response()).arrayBuffer();
    expect(progress).toHaveBeenLastCalledWith(3, 0);
  });

  it('distinguishes fetch timeouts from explicit cancellation', async () => {
    vi.useFakeTimers();
    const fetchImplementation = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    const timedControls = createFetchRequestAdapter({
      fetch: fetchImplementation,
    })({ ...createElements('GET'), timeout: 10 }, undefined as never);
    const timedRequest = expect(timedControls.response()).rejects.toMatchObject(
      { code: 'TIMEOUT' },
    );
    await vi.advanceTimersByTimeAsync(10);
    await timedRequest;

    const abortedControls = createFetchRequestAdapter({
      fetch: fetchImplementation,
    })(createElements('GET'), undefined as never);
    const abortedRequest = expect(abortedControls.response()).rejects.toSatisfy(
      isRequestCancelled,
    );
    abortedControls.abort();
    await abortedRequest;
  });

  it('returns complete axios responses and reuses one request promise', async () => {
    const response = createAxiosResponse({ ok: true });
    const request = vi.fn(
      async <TData>(
        config: AxiosRequestConfig,
      ): Promise<AxiosResponse<TData>> => {
        config.onUploadProgress?.({ loaded: 2, total: 4 } as never);
        config.onDownloadProgress?.({ loaded: 5, total: 10 } as never);
        return response as AxiosResponse<TData>;
      },
    );
    const client = { request } as unknown as AxiosInstance;
    const controls = createAxiosRequestAdapter<{ ok: boolean }>({
      client,
      withCredentials: true,
    })(createElements('POST', { name: 'Ada' }), undefined as never);
    const uploading = vi.fn();
    const downloading = vi.fn();
    controls.onUpload?.(uploading);
    controls.onDownload?.(downloading);

    await expect(controls.response()).resolves.toBe(response);
    await expect(controls.headers()).resolves.toBe(response.headers);
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'Ada' },
        method: 'POST',
        timeout: 15_000,
        url: 'https://api.test/items',
        withCredentials: true,
      }),
    );
    expect(uploading).toHaveBeenCalledWith(2, 4);
    expect(downloading).toHaveBeenCalledWith(5, 10);
  });

  it('normalizes axios HTTP, timeout, network, and cancellation errors', async () => {
    const config = {} as InternalAxiosRequestConfig;
    const httpResponse = createAxiosResponse(
      { code: 'NOT_FOUND', message: 'Missing' },
      404,
    );
    const cases = [
      {
        error: new AxiosError(
          'Request failed',
          'ERR_BAD_RESPONSE',
          config,
          undefined,
          httpResponse,
        ),
        expected: { code: 'NOT_FOUND', message: 'Missing', status: 404 },
      },
      {
        error: new AxiosError('Timed out', 'ECONNABORTED', config),
        expected: { code: 'TIMEOUT', status: 0 },
      },
      {
        error: new AxiosError('Offline', 'ERR_NETWORK', config),
        expected: { code: 'NETWORK_ERROR', status: 0 },
      },
    ];

    for (const testCase of cases) {
      const controls = createAxiosRequestAdapter({
        client: createRejectingAxiosClient(testCase.error),
      })(createElements('GET'), undefined as never);
      await expect(controls.response()).rejects.toMatchObject(
        testCase.expected,
      );
    }

    const cancelled = createAxiosRequestAdapter({
      client: createRejectingAxiosClient(new CanceledError()),
    })(createElements('GET'), undefined as never);
    await expect(cancelled.response()).rejects.toSatisfy(isRequestCancelled);
  });
});

function createElements(
  type: RequestElements['type'],
  data?: unknown,
): RequestElements {
  return {
    data,
    headers: new Headers({ Accept: 'application/json' }),
    timeout: 15_000,
    type,
    url: 'https://api.test/items',
  };
}

function createAxiosResponse<TData>(
  data: TData,
  status = 200,
): AxiosResponse<TData> {
  return {
    config: {} as InternalAxiosRequestConfig,
    data,
    headers: { 'x-request-id': 'request-1' },
    status,
    statusText: status === 200 ? 'OK' : 'Not Found',
  };
}

function createRejectingAxiosClient(error: unknown): AxiosInstance {
  return {
    request: vi.fn(async () => Promise.reject(error)),
  } as unknown as AxiosInstance;
}
