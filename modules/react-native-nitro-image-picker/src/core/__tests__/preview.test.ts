import { describe, expect, it } from 'vitest';

import {
  createAlbumPreviewItems,
  createSelectedPreviewItems,
  findPreviewIndex,
  nextPreviewIdAfterRemoval,
} from '../preview';

const assets = [
  { assetId: 'a', type: 'image' as const, fileName: 'a.jpg' },
  { assetId: 'b', type: 'video' as const, duration: 2_000 },
  { assetId: 'c', type: 'image' as const },
];

describe('picker preview items', () => {
  it('keeps album order and locates the requested initial item', () => {
    const items = createAlbumPreviewItems(assets);
    expect(items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(findPreviewIndex(items, 'b')).toBe(1);
  });

  it('keeps selection order and includes captured media', () => {
    const items = createSelectedPreviewItems(assets, ['c', 'capture', 'a'], {
      capture: { uri: 'file:///capture.jpg', type: 'image' },
    });
    expect(items.map((item) => item.id)).toEqual(['c', 'capture', 'a']);
    expect(items[1]?.uri).toBe('file:///capture.jpg');
  });

  it('skips unavailable selected resources', () => {
    const items = createSelectedPreviewItems(assets, ['missing', 'a'], {});
    expect(items.map((item) => item.id)).toEqual(['a']);
  });

  it('selects the following item after removal and falls back to the previous item', () => {
    const items = createAlbumPreviewItems(assets);
    expect(nextPreviewIdAfterRemoval(items, 'b')).toBe('c');
    expect(nextPreviewIdAfterRemoval(items, 'c')).toBe('b');
    expect(nextPreviewIdAfterRemoval([items[0]!], 'a')).toBeUndefined();
  });
});
