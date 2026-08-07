import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import type {
  FileMediaCacheStrategyOptions,
  MediaCacheEntryInfo,
  MediaCacheKind,
  MediaCachePrefetchResult,
  MediaCacheRemovalResult,
  MediaCacheResolution,
  MediaCacheSource,
  MediaCacheStats,
  MediaCacheStrategy,
} from '../types';

const CACHE_INDEX_KEY = '@react-native-components/media-cache/v1';
const CACHE_DIRECTORY_NAME = 'react-native-components-media-cache';
const CACHE_VERSION_DIRECTORY = 'v1';
const CACHE_INDEX_VERSION = 1;
const HTTP_URI_PATTERN = /^https?:\/\//i;
const STREAM_URI_PATTERN = /\.(?:m3u8|mpd)(?:$|[?#])/i;

interface StoredCacheEntry {
  id: string;
  kind: MediaCacheKind;
  localUri: string;
  sizeBytes: number;
  createdAt: number;
  lastAccessedAt: number;
  expiresAt: number;
}

interface StoredCacheIndex {
  version: typeof CACHE_INDEX_VERSION;
  entries: Record<string, StoredCacheEntry>;
}

interface DownloadTask {
  controller: AbortController;
  promise: Promise<StoredCacheEntry>;
}

const EMPTY_REMOVAL_RESULT: MediaCacheRemovalResult = {
  removedCount: 0,
  removedSizeBytes: 0,
  deferredCount: 0,
};

function emptyIndex(): StoredCacheIndex {
  return { entries: {}, version: CACHE_INDEX_VERSION };
}

function isNativePlatform(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

function isCacheableSource(source: MediaCacheSource): boolean {
  return (
    HTTP_URI_PATTERN.test(source.uri) &&
    !(source.kind === 'video' && STREAM_URI_PATTERN.test(source.uri))
  );
}

function normalizedIdentity(source: MediaCacheSource): string {
  if (source.cacheKey) {
    return `${source.kind}:key:${source.cacheKey}`;
  }

  const headers = Object.entries(source.headers ?? {})
    .map(([name, value]) => [name.toLowerCase(), value] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  return `${source.kind}:uri:${source.uri}:headers:${JSON.stringify(headers)}`;
}

function fnv1a(value: string, seed: number): string {
  let hash = seed;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function getSourceId(source: MediaCacheSource): string {
  const identity = normalizedIdentity(source);
  return `${source.kind}-${fnv1a(identity, 0x811c9dc5)}${fnv1a(
    identity,
    0x9e3779b1,
  )}`;
}

function isStoredCacheEntry(value: unknown): value is StoredCacheEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const entry = value as Partial<StoredCacheEntry>;
  return (
    typeof entry.id === 'string' &&
    (entry.kind === 'image' || entry.kind === 'video') &&
    typeof entry.localUri === 'string' &&
    typeof entry.sizeBytes === 'number' &&
    typeof entry.createdAt === 'number' &&
    typeof entry.lastAccessedAt === 'number' &&
    typeof entry.expiresAt === 'number'
  );
}

function parseIndex(raw: string | null): StoredCacheIndex {
  if (!raw) {
    return emptyIndex();
  }

  const parsed = JSON.parse(raw) as Partial<StoredCacheIndex>;
  if (
    parsed.version !== CACHE_INDEX_VERSION ||
    !parsed.entries ||
    typeof parsed.entries !== 'object'
  ) {
    throw new Error('媒体缓存索引版本无效');
  }

  const entries = Object.fromEntries(
    Object.entries(parsed.entries).filter(([, entry]) =>
      isStoredCacheEntry(entry),
    ),
  );
  return { entries, version: CACHE_INDEX_VERSION };
}

function toEntryInfo(
  entry: StoredCacheEntry,
  now: number,
): MediaCacheEntryInfo {
  return { ...entry, expired: entry.expiresAt <= now };
}

function addRemovalResult(
  target: MediaCacheRemovalResult,
  entry: StoredCacheEntry,
  deferred: boolean,
): void {
  target.removedCount += 1;
  target.removedSizeBytes += entry.sizeBytes;
  if (deferred) {
    target.deferredCount += 1;
  }
}

export function createFileMediaCacheStrategy({
  storage,
  imageMaxSizeBytes,
  videoMaxSizeBytes,
  defaultMaxAgeMs,
}: FileMediaCacheStrategyOptions): MediaCacheStrategy {
  let enabled = true;
  let disposed = false;
  let indexPromise: Promise<StoredCacheIndex> | null = null;
  let mutationQueue = Promise.resolve();
  let generation = 0;
  const downloads = new Map<string, DownloadTask>();
  const activeCounts = new Map<string, number>();
  const deferredUris = new Map<string, Set<string>>();

  function getKindLimit(kind: MediaCacheKind): number {
    return kind === 'image' ? imageMaxSizeBytes : videoMaxSizeBytes;
  }

  function getKindDirectory(kind: MediaCacheKind): Directory {
    return new Directory(
      Paths.cache,
      CACHE_DIRECTORY_NAME,
      CACHE_VERSION_DIRECTORY,
      kind,
    );
  }

  async function resetCorruptIndex(): Promise<StoredCacheIndex> {
    await storage.removeItem(CACHE_INDEX_KEY);
    if (isNativePlatform()) {
      const cacheDirectory = new Directory(
        Paths.cache,
        CACHE_DIRECTORY_NAME,
        CACHE_VERSION_DIRECTORY,
      );
      if (cacheDirectory.exists) {
        cacheDirectory.delete();
      }
    }
    return emptyIndex();
  }

  function loadIndex(): Promise<StoredCacheIndex> {
    indexPromise ??= storage
      .getItem(CACHE_INDEX_KEY)
      .then(parseIndex)
      .catch(resetCorruptIndex);
    return indexPromise;
  }

  async function persistIndex(index: StoredCacheIndex): Promise<void> {
    if (Object.keys(index.entries).length === 0) {
      await storage.removeItem(CACHE_INDEX_KEY);
      return;
    }
    await storage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
  }

  function mutateIndex<T>(
    mutation: (index: StoredCacheIndex) => Promise<T> | T,
  ): Promise<T> {
    const task = mutationQueue.then(async () => mutation(await loadIndex()));
    mutationQueue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  function deleteLocalUri(localUri: string): void {
    try {
      const file = new File(localUri);
      const directory = file.parentDirectory;
      if (directory.exists) {
        directory.delete();
      }
    } catch {
      // 索引已移除时，本地清理失败不应阻断调用方继续使用缓存管理接口。
    }
  }

  function deferOrDelete(entry: StoredCacheEntry): boolean {
    if ((activeCounts.get(entry.id) ?? 0) > 0) {
      const uris = deferredUris.get(entry.id) ?? new Set<string>();
      uris.add(entry.localUri);
      deferredUris.set(entry.id, uris);
      return true;
    }
    deleteLocalUri(entry.localUri);
    return false;
  }

  async function reconcileIndex(
    index: StoredCacheIndex,
    kind?: MediaCacheKind,
  ): Promise<boolean> {
    let changed = false;
    for (const [id, entry] of Object.entries(index.entries)) {
      if (kind && entry.kind !== kind) {
        continue;
      }
      const file = new File(entry.localUri);
      if (!file.exists) {
        delete index.entries[id];
        changed = true;
        continue;
      }
      const actualSize = file.size;
      if (actualSize !== entry.sizeBytes) {
        entry.sizeBytes = actualSize;
        changed = true;
      }
    }
    cleanupOrphanDirectories(index, kind);
    return changed;
  }

  function cleanupOrphanDirectories(
    index: StoredCacheIndex,
    kind?: MediaCacheKind,
  ): void {
    if (downloads.size > 0) {
      return;
    }

    const validDirectories = new Set(
      Object.values(index.entries).map(
        (entry) => new File(entry.localUri).parentDirectory.uri,
      ),
    );
    for (const uris of deferredUris.values()) {
      for (const uri of uris) {
        validDirectories.add(new File(uri).parentDirectory.uri);
      }
    }

    for (const targetKind of kind ? [kind] : (['image', 'video'] as const)) {
      const directory = getKindDirectory(targetKind);
      if (!directory.exists) {
        continue;
      }
      // 只回收策略自身目录中未被索引或活动租约引用的内容，避免误删业务文件。
      for (const child of directory.list()) {
        if (child instanceof Directory && !validDirectories.has(child.uri)) {
          child.delete();
        }
      }
    }
  }

  async function enforceLimit(
    index: StoredCacheIndex,
    kind: MediaCacheKind,
    protectedId?: string,
  ): Promise<void> {
    const entries = Object.values(index.entries)
      .filter((entry) => entry.kind === kind)
      .sort((left, right) => left.lastAccessedAt - right.lastAccessedAt);
    let totalSize = entries.reduce(
      (total, entry) => total + entry.sizeBytes,
      0,
    );
    const limit = getKindLimit(kind);

    for (const entry of entries) {
      if (totalSize <= limit) {
        break;
      }
      if (
        entry.id === protectedId ||
        downloads.has(entry.id) ||
        (activeCounts.get(entry.id) ?? 0) > 0
      ) {
        continue;
      }
      delete index.entries[entry.id];
      totalSize -= entry.sizeBytes;
      deleteLocalUri(entry.localUri);
    }
  }

  async function findEntry(
    source: MediaCacheSource,
  ): Promise<StoredCacheEntry | null> {
    if (!isNativePlatform()) {
      return null;
    }
    const id = getSourceId(source);
    return mutateIndex(async (index) => {
      const entry = index.entries[id];
      if (!entry) {
        return null;
      }
      const file = new File(entry.localUri);
      if (!file.exists) {
        delete index.entries[id];
        await persistIndex(index);
        return null;
      }
      entry.sizeBytes = file.size;
      entry.lastAccessedAt = Date.now();
      await persistIndex(index);
      return { ...entry };
    });
  }

  function createDownload(source: MediaCacheSource): Promise<StoredCacheEntry> {
    const id = getSourceId(source);
    const existingTask = downloads.get(id);
    if (existingTask) {
      return existingTask.promise;
    }

    const controller = new AbortController();
    const promise = (async () => {
      if (!enabled || disposed) {
        throw new Error('媒体缓存当前已关闭');
      }

      const rootDirectory = getKindDirectory(source.kind);
      rootDirectory.create({ idempotent: true, intermediates: true });
      generation += 1;
      const downloadDirectory = new Directory(
        rootDirectory,
        `${id}-${Date.now().toString(36)}-${generation.toString(36)}`,
      );
      downloadDirectory.create({ idempotent: true });

      try {
        const file = await File.downloadFileAsync(
          source.uri,
          downloadDirectory,
          {
            headers: source.headers,
            signal: controller.signal,
          },
        );
        if (!enabled || disposed) {
          throw new Error('媒体缓存下载期间已关闭');
        }

        const now = Date.now();
        const entry: StoredCacheEntry = {
          createdAt: now,
          expiresAt: now + (source.maxAgeMs ?? defaultMaxAgeMs),
          id,
          kind: source.kind,
          lastAccessedAt: now,
          localUri: file.uri,
          sizeBytes: file.size,
        };

        await mutateIndex(async (index) => {
          const previous = index.entries[id];
          index.entries[id] = entry;
          await enforceLimit(index, source.kind, id);
          await persistIndex(index);
          if (previous && previous.localUri !== entry.localUri) {
            deferOrDelete(previous);
          }
        });
        return entry;
      } catch (error) {
        if (downloadDirectory.exists) {
          downloadDirectory.delete();
        }
        throw error;
      }
    })();

    downloads.set(id, { controller, promise });
    void promise.then(
      () => downloads.delete(id),
      () => downloads.delete(id),
    );
    return promise;
  }

  function startBackgroundRefresh(source: MediaCacheSource): Promise<void> {
    return createDownload(source).then(() => undefined);
  }

  function setEnabled(nextEnabled: boolean): void {
    enabled = nextEnabled;
    if (!nextEnabled) {
      for (const task of downloads.values()) {
        task.controller.abort('媒体缓存全局开关已关闭');
      }
    }
  }

  async function resolve(
    source: MediaCacheSource,
    mode: 'background' | 'wait',
  ): Promise<MediaCacheResolution> {
    if (
      !enabled ||
      disposed ||
      !isCacheableSource(source) ||
      !isNativePlatform()
    ) {
      return { cached: false, uri: source.uri };
    }

    const entry = await findEntry(source);
    if (entry) {
      const backgroundTask =
        entry.expiresAt <= Date.now()
          ? startBackgroundRefresh(source)
          : undefined;
      return {
        backgroundTask,
        cached: true,
        id: entry.id,
        uri: entry.localUri,
      };
    }

    if (mode === 'background') {
      return {
        backgroundTask: startBackgroundRefresh(source),
        cached: false,
        uri: source.uri,
      };
    }

    const downloaded = await createDownload(source);
    return { cached: true, id: downloaded.id, uri: downloaded.localUri };
  }

  function retain(id: string): void {
    activeCounts.set(id, (activeCounts.get(id) ?? 0) + 1);
  }

  function release(id: string): void {
    const count = activeCounts.get(id) ?? 0;
    if (count > 1) {
      activeCounts.set(id, count - 1);
      return;
    }
    activeCounts.delete(id);
    const uris = deferredUris.get(id);
    if (uris) {
      for (const uri of uris) {
        deleteLocalUri(uri);
      }
      deferredUris.delete(id);
    }

    // 活跃文件释放后重新执行容量检查，补偿此前为保证播放连续性跳过的淘汰。
    void mutateIndex(async (index) => {
      const entry = index.entries[id];
      if (entry) {
        await enforceLimit(index, entry.kind);
        await persistIndex(index);
      }
    });
  }

  async function prefetch(
    source: MediaCacheSource,
  ): Promise<MediaCachePrefetchResult> {
    const result = await resolve(source, 'wait');
    return { cached: result.cached, id: result.id, uri: result.uri };
  }

  async function getEntries(
    kind?: MediaCacheKind,
  ): Promise<MediaCacheEntryInfo[]> {
    if (!isNativePlatform()) {
      return [];
    }
    return mutateIndex(async (index) => {
      const changed = await reconcileIndex(index, kind);
      if (changed) {
        await persistIndex(index);
      }
      const now = Date.now();
      return Object.values(index.entries)
        .filter((entry) => !kind || entry.kind === kind)
        .sort((left, right) => right.lastAccessedAt - left.lastAccessedAt)
        .map((entry) => toEntryInfo(entry, now));
    });
  }

  async function getStats(): Promise<MediaCacheStats> {
    const entries = await getEntries();
    const stats: MediaCacheStats = {
      image: { count: 0, sizeBytes: 0 },
      totalCount: 0,
      totalSizeBytes: 0,
      video: { count: 0, sizeBytes: 0 },
    };
    for (const entry of entries) {
      stats.totalCount += 1;
      stats.totalSizeBytes += entry.sizeBytes;
      stats[entry.kind].count += 1;
      stats[entry.kind].sizeBytes += entry.sizeBytes;
    }
    return stats;
  }

  async function remove(
    target: string | MediaCacheSource,
  ): Promise<MediaCacheRemovalResult> {
    if (!isNativePlatform()) {
      return { ...EMPTY_REMOVAL_RESULT };
    }
    const id = typeof target === 'string' ? target : getSourceId(target);
    downloads.get(id)?.controller.abort('指定媒体缓存已清除');
    return mutateIndex(async (index) => {
      const entry = index.entries[id];
      if (!entry) {
        return { ...EMPTY_REMOVAL_RESULT };
      }
      delete index.entries[id];
      const result = { ...EMPTY_REMOVAL_RESULT };
      addRemovalResult(result, entry, deferOrDelete(entry));
      await persistIndex(index);
      return result;
    });
  }

  async function clear(
    kind?: MediaCacheKind,
  ): Promise<MediaCacheRemovalResult> {
    if (!isNativePlatform()) {
      return { ...EMPTY_REMOVAL_RESULT };
    }
    for (const [id, task] of downloads) {
      if (!kind || id.startsWith(`${kind}-`)) {
        task.controller.abort('媒体缓存已批量清除');
      }
    }
    return mutateIndex(async (index) => {
      const result = { ...EMPTY_REMOVAL_RESULT };
      for (const [id, entry] of Object.entries(index.entries)) {
        if (kind && entry.kind !== kind) {
          continue;
        }
        delete index.entries[id];
        addRemovalResult(result, entry, deferOrDelete(entry));
      }
      await persistIndex(index);
      return result;
    });
  }

  function dispose(): void {
    disposed = true;
    setEnabled(false);
    activeCounts.clear();
    for (const uris of deferredUris.values()) {
      for (const uri of uris) {
        deleteLocalUri(uri);
      }
    }
    deferredUris.clear();
  }

  return {
    clear,
    dispose,
    getEntries,
    getStats,
    prefetch,
    release,
    remove,
    resolve,
    retain,
    setEnabled,
  };
}
