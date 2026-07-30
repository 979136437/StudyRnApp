import ky, {
  HTTPError,
  isNetworkError,
  isTimeoutError,
  type Options as KyOptions,
} from 'ky';

import type { HttpMethod } from '../types';
import {
  createHttpError,
  createNetworkError,
  createTimeoutError,
  readResponseBody,
} from './shared';
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
    throw createHttpError(
      error.response,
      responseBody,
      error.response.status,
      error.response.statusText,
      error,
    );
  }
  if (isTimeoutError(error)) {
    throw createTimeoutError(error);
  }
  if (isNetworkError(error)) {
    throw createNetworkError(error);
  }
  throw error;
}
