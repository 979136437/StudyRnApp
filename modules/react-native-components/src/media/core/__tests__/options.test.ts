import { describe, expect, it, vi } from 'vitest';

import {
  normalizeChooseOptions,
  normalizeImageOptions,
  normalizePreviewOptions,
  normalizeVideoOptions,
} from '../options';
import { runMediaTask } from '../task';

describe('media options', () => {
  it('applies WeChat-compatible choose defaults', () => {
    expect(normalizeChooseOptions()).toEqual({
      count: 9,
      mediaType: ['image', 'video'],
      sourceType: ['album', 'camera'],
      maxDuration: 10,
      sizeType: ['original', 'compressed'],
      camera: 'back',
    });
  });

  it.each([
    { count: 0 },
    { count: 21 },
    { count: 1.5 },
    { maxDuration: 2 },
    { maxDuration: 61 },
  ])('rejects choose boundary %o', (options) =>
    expect(() => normalizeChooseOptions(options)).toThrow(),
  );

  it('validates preview current and image dimensions', () => {
    expect(() =>
      normalizePreviewOptions({
        sources: [{ url: 'file://a.jpg' }],
        current: 1,
      }),
    ).toThrow();
    expect(() =>
      normalizeImageOptions({ src: 'file://a.jpg', compressedWidth: 0 }),
    ).toThrow();
  });

  it('keeps a valid fps for the native compressor', () => {
    expect(
      normalizeVideoOptions({ src: 'file://a.mp4', fps: 30 }),
    ).toMatchObject({ fps: 30, quality: 'medium' });
    expect(() =>
      normalizeVideoOptions({ src: 'file://a.mp4', fps: 0 }),
    ).toThrow();
  });
});

describe('media task callbacks', () => {
  it('settles success and complete once', async () => {
    const success = vi.fn();
    const complete = vi.fn();
    await expect(
      runMediaTask({ success, complete }, async () => ({ ok: true })),
    ).resolves.toEqual({ ok: true });
    expect(success).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('settles fail and complete once', async () => {
    const fail = vi.fn();
    const complete = vi.fn();
    await expect(
      runMediaTask({ fail, complete }, async () => {
        throw new Error('failure');
      }),
    ).rejects.toThrow('媒体操作失败');
    expect(fail).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('settles callbacks when validation throws synchronously', async () => {
    const fail = vi.fn();
    const complete = vi.fn();
    await expect(
      runMediaTask({ fail, complete }, () => {
        throw new Error('invalid');
      }),
    ).rejects.toThrow('媒体操作失败');
    expect(fail).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
