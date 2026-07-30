import { isRequestCancelled, RequestError } from '../client/error';
import type { HttpMethod } from '../types';
import {
  createHttpError,
  createNetworkError,
  createTimeoutError,
  readResponseBody,
} from './shared';
import type { ProgressUpdater, RequestAdapter } from './types';

export type FetchImplementation = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type FetchRequestAdapterOptions = Omit<
  RequestInit,
  'body' | 'headers' | 'method' | 'signal'
> & {
  fetch?: FetchImplementation;
  validateStatus?: (status: number) => boolean;
};

export function createFetchRequestAdapter(
  options: FetchRequestAdapterOptions = {},
): RequestAdapter<Response, Headers> {
  const {
    fetch: fetchImplementation = (input, init) => globalThis.fetch(input, init),
    validateStatus = (status) => status >= 200 && status < 300,
    ...requestOptions
  } = options;

  return (elements) => {
    const controller = new AbortController();
    let download: ProgressUpdater | undefined;
    let responsePromise: Promise<Response> | undefined;
    let timedOut = false;

    const response = () => {
      responsePromise ??= executeFetch();
      return responsePromise;
    };

    const executeFetch = async () => {
      const headers = new Headers(elements.headers);
      const body = createRequestBody(elements.type, elements.data, headers);
      const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, elements.timeout);

      try {
        const result = await fetchImplementation(elements.url, {
          ...requestOptions,
          body,
          headers,
          method: elements.type,
          signal: controller.signal,
        });
        if (!validateStatus(result.status)) {
          throw createHttpError(
            result,
            await readResponseBody(result),
            result.status,
            result.statusText,
          );
        }
        return addDownloadProgress(result, download);
      } catch (error) {
        if (error instanceof RequestError) throw error;
        if (timedOut) throw createTimeoutError(error);
        if (isRequestCancelled(error)) throw error;
        if (controller.signal.aborted) {
          const abortError = new Error('Request was cancelled', {
            cause: error,
          });
          abortError.name = 'AbortError';
          throw abortError;
        }
        throw createNetworkError(error);
      } finally {
        clearTimeout(timeoutId);
      }
    };

    return {
      abort: () => controller.abort(),
      headers: async () => (await response()).headers,
      onDownload: (handler) => {
        download = handler;
      },
      response,
    };
  };
}

function createRequestBody(
  method: HttpMethod,
  data: unknown,
  headers: Headers,
): BodyInit | undefined {
  if (
    method === 'GET' ||
    method === 'HEAD' ||
    method === 'OPTIONS' ||
    data === undefined
  ) {
    return undefined;
  }
  if (isBodyInit(data)) return data;
  if (!headers.has('content-type')) {
    headers.set('Content-Type', 'application/json');
  }
  return JSON.stringify(data);
}

function isBodyInit(value: unknown): value is BodyInit {
  return (
    typeof value === 'string' ||
    (typeof Blob !== 'undefined' && value instanceof Blob) ||
    (typeof FormData !== 'undefined' && value instanceof FormData) ||
    (typeof URLSearchParams !== 'undefined' &&
      value instanceof URLSearchParams) ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream)
  );
}

function addDownloadProgress(
  response: Response,
  update: ProgressUpdater | undefined,
): Response {
  if (
    update === undefined ||
    response.body === null ||
    typeof ReadableStream === 'undefined' ||
    typeof Proxy === 'undefined'
  ) {
    return response;
  }

  const reader = response.body.getReader();
  let loaded = 0;
  const total = readContentLength(response.headers);
  try {
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const chunk = await reader.read();
        if (chunk.done) {
          controller.close();
          return;
        }
        loaded += chunk.value.byteLength;
        update(loaded, total);
        controller.enqueue(chunk.value);
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });
    const tracked = new Response(body, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
    return createResponseFacade(response, tracked);
  } catch {
    reader.releaseLock();
    return response;
  }
}

function createResponseFacade(
  original: Response,
  bodySource: Response,
): Response {
  const bodyProperties = new Set<PropertyKey>([
    'arrayBuffer',
    'blob',
    'body',
    'bodyUsed',
    'bytes',
    'formData',
    'json',
    'text',
  ]);
  return new Proxy(original, {
    get(target, property) {
      if (property === 'clone') {
        return () => createResponseFacade(target, bodySource.clone());
      }
      const source = bodyProperties.has(property) ? bodySource : target;
      const value = Reflect.get(source, property, source) as unknown;
      return typeof value === 'function' ? value.bind(source) : value;
    },
  });
}

function readContentLength(headers: Headers): number {
  const value = Number(headers.get('content-length'));
  return Number.isFinite(value) && value > 0 ? value : 0;
}
