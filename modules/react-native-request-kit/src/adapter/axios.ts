import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios';

import {
  createAbortError,
  createHttpError,
  createNetworkError,
  createTimeoutError,
} from './shared';
import type { ProgressUpdater, RequestAdapter } from './types';

export type AxiosRequestAdapterOptions = Omit<
  AxiosRequestConfig,
  | 'data'
  | 'headers'
  | 'method'
  | 'onDownloadProgress'
  | 'onUploadProgress'
  | 'signal'
  | 'timeout'
  | 'url'
> & {
  client?: AxiosInstance;
};

export function createAxiosRequestAdapter<TResponseData = unknown>(
  options: AxiosRequestAdapterOptions = {},
): RequestAdapter<
  AxiosResponse<TResponseData>,
  AxiosResponse<TResponseData>['headers']
> {
  const { client = axios, ...requestOptions } = options;

  return (elements) => {
    const controller = new AbortController();
    let download: ProgressUpdater | undefined;
    let upload: ProgressUpdater | undefined;
    let responsePromise: Promise<AxiosResponse<TResponseData>> | undefined;
    const response = () => {
      responsePromise ??= client
        .request<TResponseData>({
          ...requestOptions,
          data: elements.data,
          headers: Object.fromEntries(elements.headers.entries()),
          method: elements.type,
          onDownloadProgress: (event) => {
            download?.(event.loaded, event.total ?? 0);
          },
          onUploadProgress: (event) => {
            upload?.(event.loaded, event.total ?? 0);
          },
          signal: controller.signal,
          timeout: elements.timeout,
          url: elements.url,
        })
        .catch(normalizeAxiosError);
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

function normalizeAxiosError(error: unknown): never {
  if (!axios.isAxiosError(error)) throw error;
  if (axios.isCancel(error) || error.code === 'ERR_CANCELED') {
    throw createAbortError(error);
  }
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    throw createTimeoutError(error);
  }
  if (error.response !== undefined) {
    throw createHttpError(
      error.response,
      error.response.data,
      error.response.status,
      error.response.statusText,
      error,
    );
  }
  throw createNetworkError(error);
}
