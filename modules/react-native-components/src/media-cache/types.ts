import type { PropsWithChildren } from 'react';

export type MediaCacheKind = 'image' | 'video';

export interface MediaCacheIndexStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface MediaCacheSource {
  kind: MediaCacheKind;
  uri: string;
  headers?: Record<string, string>;
  cacheKey?: string;
  maxAgeMs?: number;
}

export interface MediaCacheEntryInfo {
  id: string;
  kind: MediaCacheKind;
  localUri: string;
  sizeBytes: number;
  createdAt: number;
  lastAccessedAt: number;
  expiresAt: number;
  expired: boolean;
}

export interface MediaCacheKindStats {
  count: number;
  sizeBytes: number;
}

export interface MediaCacheStats {
  totalCount: number;
  totalSizeBytes: number;
  image: MediaCacheKindStats;
  video: MediaCacheKindStats;
}

export interface MediaCacheRemovalResult {
  removedCount: number;
  removedSizeBytes: number;
  deferredCount: number;
}

export interface MediaCachePrefetchResult {
  uri: string;
  cached: boolean;
  id?: string;
}

export interface MediaCacheResolution extends MediaCachePrefetchResult {
  backgroundTask?: Promise<void>;
}

export type MediaCacheResolveMode = 'background' | 'wait';

export interface MediaCacheStrategy {
  setEnabled(enabled: boolean): void;
  resolve(
    source: MediaCacheSource,
    mode: MediaCacheResolveMode,
  ): Promise<MediaCacheResolution>;
  retain(id: string): void;
  release(id: string): void;
  prefetch(source: MediaCacheSource): Promise<MediaCachePrefetchResult>;
  getEntries(kind?: MediaCacheKind): Promise<MediaCacheEntryInfo[]>;
  getStats(): Promise<MediaCacheStats>;
  remove(target: string | MediaCacheSource): Promise<MediaCacheRemovalResult>;
  clear(kind?: MediaCacheKind): Promise<MediaCacheRemovalResult>;
  dispose(): void;
}

export interface FileMediaCacheStrategyOptions {
  storage: MediaCacheIndexStorage;
  imageMaxSizeBytes: number;
  videoMaxSizeBytes: number;
  defaultMaxAgeMs: number;
}

export interface MediaCacheContextValue {
  enabled: boolean;
  setEnabled(enabled: boolean): void;
  strategy: MediaCacheStrategy;
  prefetch(source: MediaCacheSource): Promise<MediaCachePrefetchResult>;
  getEntries(kind?: MediaCacheKind): Promise<MediaCacheEntryInfo[]>;
  getStats(): Promise<MediaCacheStats>;
  remove(target: string | MediaCacheSource): Promise<MediaCacheRemovalResult>;
  clear(kind?: MediaCacheKind): Promise<MediaCacheRemovalResult>;
}

export interface MediaCacheProviderProps extends PropsWithChildren {
  strategy: MediaCacheStrategy;
  defaultEnabled?: boolean;
}
