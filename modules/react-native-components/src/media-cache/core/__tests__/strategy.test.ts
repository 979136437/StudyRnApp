import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFileMediaCacheStrategy } from '../strategy';
import type { MediaCacheIndexStorage, MediaCacheSource } from '../../types';

const fileSystemMock = vi.hoisted(() => {
  const directories = new Set<string>();
  const files = new Map<string, number>();
  const downloadFileAsync = vi.fn();

  function join(parts: string[]): string {
    return parts
      .map((part, index) =>
        index === 0 ? part.replace(/\/$/, '') : part.replace(/^\//, ''),
      )
      .join('/');
  }

  class MockDirectory {
    uri: string;

    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(
        parts.map((part) => (typeof part === 'string' ? part : part.uri)),
      );
    }

    get exists(): boolean {
      return directories.has(this.uri);
    }

    create(): void {
      directories.add(this.uri);
    }

    delete(): void {
      for (const uri of files.keys()) {
        if (uri.startsWith(`${this.uri}/`)) {
          files.delete(uri);
        }
      }
      for (const uri of directories) {
        if (uri === this.uri || uri.startsWith(`${this.uri}/`)) {
          directories.delete(uri);
        }
      }
    }

    list(): MockDirectory[] {
      const prefix = `${this.uri}/`;
      return [...directories]
        .filter((uri) => {
          const relativePath = uri.slice(prefix.length);
          return uri.startsWith(prefix) && !relativePath.includes('/');
        })
        .map((uri) => new MockDirectory(uri));
    }
  }

  class MockFile {
    static downloadFileAsync = downloadFileAsync;

    uri: string;

    constructor(uri: string) {
      this.uri = uri;
    }

    get exists(): boolean {
      return files.has(this.uri);
    }

    get size(): number {
      return files.get(this.uri) ?? 0;
    }

    get parentDirectory(): MockDirectory {
      return new MockDirectory(this.uri.slice(0, this.uri.lastIndexOf('/')));
    }
  }

  function reset(): void {
    directories.clear();
    files.clear();
    downloadFileAsync.mockReset();
    downloadFileAsync.mockImplementation(
      async (
        uri: string,
        directory: MockDirectory,
        options?: { signal?: AbortSignal },
      ) => {
        if (options?.signal?.aborted) {
          throw new Error('AbortError');
        }
        await Promise.resolve();
        const fileUri = `${directory.uri}/${uri.includes('video') ? 'media.mp4' : 'media.jpg'}`;
        files.set(fileUri, uri.includes('video') ? 1_000 : 100);
        return new MockFile(fileUri);
      },
    );
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: { cache: { uri: 'file:///cache' } },
    directories,
    downloadFileAsync,
    files,
    reset,
  };
});

vi.mock('expo-file-system', () => ({
  Directory: fileSystemMock.Directory,
  File: fileSystemMock.File,
  Paths: fileSystemMock.Paths,
}));

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

function createStorage(): MediaCacheIndexStorage & {
  values: Map<string, string>;
} {
  const values = new Map<string, string>();
  return {
    getItem: async (key) => values.get(key) ?? null,
    removeItem: async (key) => {
      values.delete(key);
    },
    setItem: async (key, value) => {
      values.set(key, value);
    },
    values,
  };
}

function image(uri = 'https://example.test/image.jpg'): MediaCacheSource {
  return { kind: 'image', uri };
}

function video(uri = 'https://example.test/video.mp4'): MediaCacheSource {
  return { kind: 'video', uri };
}

beforeEach(() => {
  fileSystemMock.reset();
});

describe('文件媒体缓存策略', () => {
  it('统计全部缓存数量、大小及媒体分类', async () => {
    const strategy = createFileMediaCacheStrategy({
      defaultMaxAgeMs: 60_000,
      imageMaxSizeBytes: 10_000,
      storage: createStorage(),
      videoMaxSizeBytes: 10_000,
    });

    await strategy.prefetch(image());
    await strategy.prefetch(video());

    await expect(strategy.getStats()).resolves.toEqual({
      image: { count: 1, sizeBytes: 100 },
      totalCount: 2,
      totalSizeBytes: 1_100,
      video: { count: 1, sizeBytes: 1_000 },
    });
  });

  it('合并同一来源的并发下载', async () => {
    const strategy = createFileMediaCacheStrategy({
      defaultMaxAgeMs: 60_000,
      imageMaxSizeBytes: 10_000,
      storage: createStorage(),
      videoMaxSizeBytes: 10_000,
    });

    await Promise.all([strategy.prefetch(image()), strategy.prefetch(image())]);

    expect(fileSystemMock.downloadFileAsync).toHaveBeenCalledOnce();
    await expect(strategy.getEntries('image')).resolves.toHaveLength(1);
  });

  it('支持按缓存编号、类型及全部清除', async () => {
    const strategy = createFileMediaCacheStrategy({
      defaultMaxAgeMs: 60_000,
      imageMaxSizeBytes: 10_000,
      storage: createStorage(),
      videoMaxSizeBytes: 10_000,
    });
    const firstImage = await strategy.prefetch(image());
    await strategy.prefetch(image('https://example.test/second.jpg'));
    await strategy.prefetch(video());

    await expect(strategy.remove(firstImage.id!)).resolves.toMatchObject({
      removedCount: 1,
      removedSizeBytes: 100,
    });
    await expect(strategy.clear('image')).resolves.toMatchObject({
      removedCount: 1,
      removedSizeBytes: 100,
    });
    await expect(strategy.clear()).resolves.toMatchObject({
      removedCount: 1,
      removedSizeBytes: 1_000,
    });
    await expect(strategy.getStats()).resolves.toMatchObject({
      totalCount: 0,
      totalSizeBytes: 0,
    });
  });

  it('活动文件先从索引移除并在释放后物理删除', async () => {
    const strategy = createFileMediaCacheStrategy({
      defaultMaxAgeMs: 60_000,
      imageMaxSizeBytes: 10_000,
      storage: createStorage(),
      videoMaxSizeBytes: 10_000,
    });
    const cached = await strategy.prefetch(image());
    strategy.retain(cached.id!);

    await expect(strategy.remove(cached.id!)).resolves.toMatchObject({
      deferredCount: 1,
      removedCount: 1,
    });
    expect(fileSystemMock.files.has(cached.uri)).toBe(true);

    strategy.release(cached.id!);
    expect(fileSystemMock.files.has(cached.uri)).toBe(false);
  });

  it('全局关闭后直接返回远程地址且不写入索引', async () => {
    const strategy = createFileMediaCacheStrategy({
      defaultMaxAgeMs: 60_000,
      imageMaxSizeBytes: 10_000,
      storage: createStorage(),
      videoMaxSizeBytes: 10_000,
    });
    strategy.setEnabled(false);

    await expect(strategy.prefetch(image())).resolves.toEqual({
      cached: false,
      uri: 'https://example.test/image.jpg',
    });
    expect(fileSystemMock.downloadFileAsync).not.toHaveBeenCalled();
    await expect(strategy.getEntries()).resolves.toEqual([]);
  });

  it('索引只保存本地地址而不明文保存请求头', async () => {
    const storage = createStorage();
    const strategy = createFileMediaCacheStrategy({
      defaultMaxAgeMs: 60_000,
      imageMaxSizeBytes: 10_000,
      storage,
      videoMaxSizeBytes: 10_000,
    });

    await strategy.prefetch(
      image('https://example.test/private.jpg?signature=temporary'),
    );
    const serializedIndex = [...storage.values.values()].join('');

    expect(serializedIndex).not.toContain('Authorization');
    expect(serializedIndex).not.toContain('signature=temporary');
    expect(serializedIndex).toContain('file:///cache');
  });
});
