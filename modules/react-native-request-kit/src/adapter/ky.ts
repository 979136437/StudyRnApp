import ky, {
  HTTPError,
  isNetworkError,
  isTimeoutError,
  type KyResponse,
  type Options as KyOptions,
} from 'ky';

import { RequestError } from '../client/error';
import type { HttpMethod } from '../types';
import type { RequestAdapter } from './types';

export type KyRequestAdapterOptions = Omit<
  KyOptions,
  | 'body'
  | 'headers'
  | 'json'
  | 'method'
  | 'onDownloadProgress'
  | 'onUploadProgress'
  | 'retry'
  | 'signal'
  | 'timeout'
>;

export function createKyRequestAdapter(
  options: KyRequestAdapterOptions = {},
): RequestAdapter<Response, Headers> {
  return (elements) => {
    const controller = new AbortController();
    let download: ((loaded: number, total: number) => void) | undefined;
    let upload: ((loaded: number, total: number) => void) | undefined;
    let responsePromise: Promise<Response> | undefined;
    const response = () => {
      responsePromise ??= ky(elements.url, {
        ...options,
        ...createBodyOptions(elements.type, elements.data),
        headers: elements.headers,
        method: elements.type,
        onDownloadProgress: (progress) => {
          download?.(progress.transferredBytes, progress.totalBytes);
        },
        onUploadProgress: (progress) => {
          upload?.(progress.transferredBytes, progress.totalBytes);
        },
        retry: 0,
        signal: controller.signal,
        timeout: elements.timeout,
      }).catch(normalizeKyError);
      return responsePromise;
    };

    return {
      abort: () => controller.abort(),
      headers: async () => (await response()).headers,
      onDownload: (handler) => {
        download = handler;
      },
      onUpload: (handler) => {
        upload = handler;
      },
      response,
    };
  };
}

function createBodyOptions(method: HttpMethod, data: unknown): KyOptions {
  if (
    method === 'GET' ||
    method === 'HEAD' ||
    method === 'OPTIONS' ||
    data === undefined
  ) {
    return {};
  }
  if (
    typeof data === 'string' ||
    data instanceof Blob ||
    data instanceof FormData ||
    data instanceof URLSearchParams ||
    data instanceof ArrayBuffer
  ) {
    return { body: data as BodyInit };
  }
  return { json: data };
}

async function normalizeKyError(error: unknown): Promise<never> {
  if (error instanceof HTTPError) {
    const responseBody = error.data ?? (await readResponseBody(error.response));
    throw new RequestError(
      readErrorMessage(responseBody) ??
        `Request failed with status ${error.response.status}`,
      {
        cause: error,
        code: readErrorCode(responseBody) ?? 'HTTP_ERROR',
        response: error.response,
        responseBody,
        status: error.response.status,
      },
    );
  }
  if (isTimeoutError(error)) {
    throw new RequestError('Request timed out', {
      cause: error,
      code: 'TIMEOUT',
      status: 0,
    });
  }
  if (isNetworkError(error)) {
    throw new RequestError('Network request failed', {
      cause: error,
      code: 'NETWORK_ERROR',
      status: 0,
    });
  }
  throw error;
}

async function readResponseBody(response: KyResponse): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      return await response.clone().json();
    }
    const text = await response.clone().text();
    return text.length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}

function readErrorMessage(body: unknown): string | undefined {
  if (typeof body === 'string') return body;
  return isRecord(body) && typeof body.message === 'string'
    ? body.message
    : undefined;
}

function readErrorCode(body: unknown): string | undefined {
  return isRecord(body) && typeof body.code === 'string'
    ? body.code
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
