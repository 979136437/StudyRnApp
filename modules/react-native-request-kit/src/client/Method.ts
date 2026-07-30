import type { QueryKey, UseQueryOptions } from '@tanstack/react-query';
import type { Options as KyOptions } from 'ky';

import type {
  CacheFor,
  CreateRequestOptions,
  HttpMethod,
  MethodConfig,
  ProgressInfo,
  RequestInstance,
  RetryConfig,
} from '../types';
import {
  isRequestCancelled,
  isRetryableRequestError,
  normalizeRequestError,
  RequestError,
} from './error';
import { getRuntime, isIdempotent, keyHash, stableSerialize } from './runtime';

const DEFAULT_STALE_TIME = 5 * 60 * 1000;
const DEFAULT_EXPIRE_TIME = 24 * 60 * 60 * 1000;

type CacheSettings = {
  enabled: boolean;
  expire: number;
  expiresAt?: number;
  persist: boolean;
  staleAt?: number;
  staleTime: number;
};

export class Method<TData = unknown> implements PromiseLike<TData> {
  readonly config: Readonly<MethodConfig<TData>>;
  readonly data: unknown;
  readonly headers: Headers;
  readonly key: QueryKey;
  readonly meta: Record<string, unknown>;
  readonly name?: string;
  readonly request: RequestInstance;
  readonly type: HttpMethod;
  readonly url: string;

  private readonly downloadListeners = new Set<(event: ProgressInfo) => void>();
  private readonly uploadListeners = new Set<(event: ProgressInfo) => void>();

  constructor(
    request: RequestInstance,
    type: HttpMethod,
    url: string,
    data: unknown,
    config: MethodConfig<TData> = {},
  ) {
    this.request = request;
    this.type = type;
    this.url = url;
    this.data = data;
    this.config = Object.freeze({ ...config });
    this.meta = { ...config.meta };
    this.headers = new Headers(config.headers);
    this.name = config.name;
    this.key = Object.freeze([
      'react-native-request-kit',
      type,
      resolveUrl(getRuntime(request).options.baseUrl, url),
      normalizeParams(config.params),
      normalizeHeaders(config.headers),
      stableSerialize(data),
      readCacheTag(config.cacheFor),
    ]);
  }

  abort(): void {
    const runtime = getRuntime(this.request);
    const hash = keyHash(this.key);
    for (const controller of runtime.controllers.get(hash) ?? []) {
      controller.abort();
    }
    void runtime.queryClient.cancelQueries({ exact: true, queryKey: this.key });
  }

  catch<TResult = never>(
    onRejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<TData | TResult> {
    return this.send().catch(onRejected);
  }

  finally(onFinally?: (() => void) | null): Promise<TData> {
    return this.send().finally(onFinally ?? undefined);
  }

  onDownload(listener: (event: ProgressInfo) => void): this {
    this.downloadListeners.add(listener);
    return this;
  }

  offDownload(listener: (event: ProgressInfo) => void): this {
    this.downloadListeners.delete(listener);
    return this;
  }

  onUpload(listener: (event: ProgressInfo) => void): this {
    this.uploadListeners.add(listener);
    return this;
  }

  offUpload(listener: (event: ProgressInfo) => void): this {
    this.uploadListeners.delete(listener);
    return this;
  }

  async send(force = false): Promise<TData> {
    const runtime = getRuntime(this.request);
    const cache = this.cacheSettings();

    if (!cache.enabled) {
      return this.executeMutation();
    }

    const state = runtime.queryClient.getQueryState<TData>(this.key);
    const age = state?.dataUpdatedAt
      ? Math.max(0, Date.now() - state.dataUpdatedAt)
      : Number.POSITIVE_INFINITY;
    const expired = isCacheExpired(cache, age);

    if (
      !force &&
      !expired &&
      state?.data !== undefined &&
      isCacheFresh(cache, age)
    ) {
      return state.data;
    }

    if (!force && !expired && state?.data !== undefined) {
      void this.fetchQuery(0).catch(() => undefined);
      return state.data;
    }

    if (expired) {
      runtime.queryClient.removeQueries({ exact: true, queryKey: this.key });
    }

    return this.fetchQuery(force ? 0 : cache.staleTime);
  }

  // oxlint-disable-next-line unicorn/no-thenable -- alova-compatible promise API
  then<TResult1 = TData, TResult2 = never>(
    onFulfilled?: ((value: TData) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.send().then(onFulfilled, onRejected);
  }

  /** @internal */
  cacheSettings(): CacheSettings {
    const runtime = getRuntime(this.request);
    const configured =
      this.config.cacheFor ??
      readGlobalCache(runtime.options.cacheFor, this.type);
    return resolveCacheSettings(
      configured,
      isIdempotent(this.type),
      runtime.persistOptions !== undefined,
    );
  }

  /** @internal */
  discardExpiredCache(): void {
    const cache = this.cacheSettings();
    if (!cache.enabled) {
      return;
    }
    const runtime = getRuntime(this.request);
    const state = runtime.queryClient.getQueryState(this.key);
    if (
      state?.dataUpdatedAt &&
      isCacheExpired(cache, Date.now() - state.dataUpdatedAt)
    ) {
      runtime.queryClient.removeQueries({ exact: true, queryKey: this.key });
    }
  }

  /** @internal */
  execute(signal?: AbortSignal): Promise<TData> {
    return this.executeNetwork(signal);
  }

  /** Execute exactly one network attempt and update this method's cache. */
  async executeOnce(signal?: AbortSignal): Promise<TData> {
    const data = await this.executeNetwork(signal);
    if (this.cacheSettings().enabled) {
      getRuntime(this.request).queryClient.setQueryData(this.key, data);
    }
    return data;
  }

  /** @internal */
  queryOptions(): UseQueryOptions<TData, RequestError, TData, QueryKey> {
    const cache = this.cacheSettings();
    const retry = resolveRetry(
      this.config.retry,
      getRuntime(this.request).options.retry,
      true,
    );
    return {
      enabled: cache.enabled,
      gcTime: cache.expire,
      meta: { persist: cache.persist },
      queryFn: ({ signal }) => this.executeNetwork(signal),
      queryKey: this.key,
      refetchOnMount: true,
      retry: retry.check,
      retryDelay: retry.delay,
      staleTime:
        cache.staleAt === undefined
          ? cache.staleTime
          : (query) => Math.max(0, cache.staleAt! - query.state.dataUpdatedAt),
    };
  }

  private async executeMutation(): Promise<TData> {
    const runtime = getRuntime(this.request);
    const retry = resolveRetry(
      this.config.retry,
      runtime.options.retry,
      isIdempotent(this.type),
    );
    return runtime.queryClient
      .getMutationCache()
      .build<TData, RequestError, void, unknown>(runtime.queryClient, {
        mutationFn: () => this.executeNetwork(),
        mutationKey: this.key,
        retry: retry.check,
        retryDelay: retry.delay,
      })
      .execute(undefined);
  }

  private fetchQuery(staleTime: number): Promise<TData> {
    const runtime = getRuntime(this.request);
    const options = this.queryOptions();
    if (runtime.options.shareRequest === false) {
      return this.executeMutation().then((data) => {
        runtime.queryClient.setQueryData(this.key, data);
        return data;
      });
    }
    return runtime.queryClient.fetchQuery({ ...options, staleTime });
  }

  private async executeNetwork(parentSignal?: AbortSignal): Promise<TData> {
    const runtime = getRuntime(this.request);
    const controller = new AbortController();
    const hash = keyHash(this.key);
    const controllers = runtime.controllers.get(hash) ?? new Set();
    controllers.add(controller);
    runtime.controllers.set(hash, controllers);

    const abortFromParent = () => controller.abort();
    parentSignal?.addEventListener('abort', abortFromParent, { once: true });
    if (parentSignal?.aborted) {
      controller.abort();
    }

    let completedData: TData | undefined;
    let completedError: RequestError | undefined;
    try {
      const response = await runtime.client(
        requestInput(runtime.options.baseUrl, this.url),
        {
          ...createBodyOptions(this.type, this.data),
          headers: this.headers,
          hooks:
            runtime.options.beforeRequest === undefined
              ? undefined
              : {
                  beforeRequest: [
                    async ({ request }) =>
                      runtime.options.beforeRequest!(
                        request,
                        this as Method<unknown>,
                      ),
                  ],
                },
          method: this.type,
          onDownloadProgress: (progress) => {
            this.emitProgress(this.downloadListeners, progress);
          },
          onUploadProgress: (progress) => {
            this.emitProgress(this.uploadListeners, progress);
          },
          searchParams: normalizeSearchParams(this.config.params),
          signal: controller.signal,
          timeout: this.config.timeout ?? runtime.options.timeout ?? 15_000,
        },
      );

      const data = await this.transformResponse(response);
      completedData = data;
      await this.invalidateHitSource();
      return data;
    } catch (error) {
      if (isRequestCancelled(error)) {
        completedError = new RequestError('Request was cancelled', {
          cause: error,
          code: 'REQUEST_CANCELLED',
          status: -1,
        });
        throw error;
      }
      const normalized = await normalizeRequestError(error);
      completedError = normalized;
      if (runtime.options.responded?.onError !== undefined) {
        const data = (await runtime.options.responded.onError(
          normalized,
          this as Method<unknown>,
        )) as TData;
        completedData = data;
        completedError = undefined;
        return data;
      }
      throw normalized;
    } finally {
      parentSignal?.removeEventListener('abort', abortFromParent);
      controllers.delete(controller);
      if (controllers.size === 0) {
        runtime.controllers.delete(hash);
      }
      await runtime.options.responded?.onComplete?.(
        this as Method<unknown>,
        completedError === undefined
          ? { data: completedData, status: 'success' }
          : { error: completedError, status: 'error' },
      );
    }
  }

  private emitProgress(
    listeners: ReadonlySet<(event: ProgressInfo) => void>,
    progress: { percent: number; totalBytes: number; transferredBytes: number },
  ): void {
    const event = {
      loaded: progress.transferredBytes,
      percent: progress.percent,
      total: progress.totalBytes,
    };
    for (const listener of listeners) {
      listener(event);
    }
  }

  private async invalidateHitSource(): Promise<void> {
    const source = this.config.hitSource;
    if (source === undefined) {
      return;
    }
    const { invalidateCache } = await import('../cache/operations');
    await invalidateCache(source, this.request);
  }

  private async transformResponse(response: Response): Promise<TData> {
    const runtime = getRuntime(this.request);
    if (this.config.transform !== undefined) {
      return this.config.transform(response);
    }
    if (runtime.options.responded?.onSuccess !== undefined) {
      return (await runtime.options.responded.onSuccess(
        response,
        this as Method<unknown>,
      )) as TData;
    }
    if (response.status === 204 || this.type === 'HEAD') {
      return undefined as TData;
    }
    switch (this.config.responseType ?? 'json') {
      case 'arrayBuffer':
        return (await response.arrayBuffer()) as TData;
      case 'blob':
        return (await response.blob()) as TData;
      case 'formData':
        return (await response.formData()) as TData;
      case 'text':
        return (await response.text()) as TData;
      default:
        return (await response.json()) as TData;
    }
  }
}

function createBodyOptions(method: HttpMethod, data: unknown): KyOptions {
  if (isIdempotent(method) || data === undefined) {
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

function normalizeHeaders(
  headers?: HeadersInit,
): readonly (readonly string[])[] {
  return [...new Headers(headers).entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

function normalizeParams(
  params?: Record<string, string | number | boolean | null | undefined>,
): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(params ?? {})
      .filter(
        (entry): entry is [string, string | number | boolean | null] =>
          entry[1] !== undefined,
      )
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function normalizeSearchParams(
  params?: Record<string, string | number | boolean | null | undefined>,
): Record<string, string | number | boolean> | undefined {
  if (params === undefined) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(params).filter(
      (entry): entry is [string, string | number | boolean] =>
        entry[1] !== undefined && entry[1] !== null,
    ),
  );
}

function readCacheTag(cacheFor: CacheFor | undefined): string | undefined {
  return typeof cacheFor === 'object' && !(cacheFor instanceof Date)
    ? cacheFor?.tag
    : undefined;
}

function readGlobalCache(
  cacheFor: CreateRequestOptions['cacheFor'],
  method: HttpMethod,
): CacheFor | undefined {
  if (
    cacheFor !== null &&
    typeof cacheFor === 'object' &&
    !(cacheFor instanceof Date) &&
    !('mode' in cacheFor) &&
    !('expire' in cacheFor) &&
    !('staleTime' in cacheFor)
  ) {
    return (cacheFor as Partial<Record<HttpMethod, CacheFor>>)[method];
  }
  return cacheFor as CacheFor | undefined;
}

function resolveCacheSettings(
  cacheFor: CacheFor | undefined,
  idempotent: boolean,
  hasPersister: boolean,
): CacheSettings {
  if (!idempotent || cacheFor === null) {
    return { enabled: false, expire: 0, persist: false, staleTime: 0 };
  }
  if (cacheFor === undefined) {
    return {
      enabled: true,
      expire: DEFAULT_EXPIRE_TIME,
      persist: hasPersister,
      staleTime: DEFAULT_STALE_TIME,
    };
  }
  if (typeof cacheFor === 'number' || cacheFor instanceof Date) {
    const expire = resolveExpire(cacheFor);
    return {
      enabled: expire > 0,
      expire,
      expiresAt: cacheFor instanceof Date ? cacheFor.getTime() : undefined,
      persist: false,
      staleAt: cacheFor instanceof Date ? cacheFor.getTime() : undefined,
      staleTime: expire,
    };
  }

  const expire = resolveExpire(cacheFor.expire ?? DEFAULT_EXPIRE_TIME);
  const isSWR = cacheFor.mode === 'swr';
  return {
    enabled: expire > 0,
    expire,
    expiresAt:
      cacheFor.expire instanceof Date ? cacheFor.expire.getTime() : undefined,
    persist: hasPersister && cacheFor.mode !== 'memory',
    staleAt:
      !isSWR && cacheFor.expire instanceof Date
        ? cacheFor.expire.getTime()
        : undefined,
    staleTime: isSWR
      ? Math.min(cacheFor.staleTime ?? DEFAULT_STALE_TIME, expire)
      : expire,
  };
}

function isCacheExpired(cache: CacheSettings, age: number): boolean {
  return cache.expiresAt === undefined
    ? age >= cache.expire
    : Date.now() >= cache.expiresAt;
}

function isCacheFresh(cache: CacheSettings, age: number): boolean {
  return cache.staleAt === undefined
    ? age < cache.staleTime
    : Date.now() < cache.staleAt;
}

function resolveExpire(expire: number | Date): number {
  return Math.max(
    0,
    expire instanceof Date ? expire.getTime() - Date.now() : expire,
  );
}

function resolveRetry(
  methodRetry: number | RetryConfig | false | undefined,
  globalRetry: number | RetryConfig | false | undefined,
  idempotent: boolean,
) {
  const retry = methodRetry ?? globalRetry ?? (idempotent ? 2 : 0);
  const limit =
    retry === false
      ? 0
      : typeof retry === 'number'
        ? retry
        : (retry.limit ?? 2);
  const delay =
    typeof retry === 'object' && retry.delay !== undefined
      ? retry.delay
      : (failureCount: number) => Math.min(1000 * 2 ** failureCount, 30_000);
  return {
    check: (failureCount: number, error: Error) =>
      failureCount < limit && isRetryableRequestError(error),
    delay,
  };
}

function resolveUrl(baseUrl: string | undefined, url: string): string {
  if (!baseUrl || /^[a-z][a-z\d+.-]*:/i.test(url)) {
    return url;
  }
  return new URL(url.replace(/^\/+/, ''), `${baseUrl.replace(/\/+$/, '')}/`)
    .href;
}

function requestInput(baseUrl: string | undefined, url: string): string {
  return baseUrl && !/^[a-z][a-z\d+.-]*:/i.test(url)
    ? url.replace(/^\/+/, '')
    : url;
}
