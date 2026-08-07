import type { Method } from '../core/method';
import type { HttpMethod } from '../types';

export type ProgressUpdater = (loaded: number, total: number) => void;

export type RequestElements = {
  data?: unknown;
  headers: Headers;
  timeout: number;
  type: HttpMethod;
  url: string;
};

export type RequestAdapterControls<TResponse, TResponseHeaders> = {
  abort: () => void;
  headers: () => Promise<TResponseHeaders>;
  onDownload?: (handler: ProgressUpdater) => void;
  onUpload?: (handler: ProgressUpdater) => void;
  response: () => Promise<TResponse>;
};

export type RequestAdapter<TResponse = Response, TResponseHeaders = Headers> = (
  elements: RequestElements,
  method: Method<unknown, TResponse, TResponseHeaders, unknown>,
) => RequestAdapterControls<TResponse, TResponseHeaders>;
