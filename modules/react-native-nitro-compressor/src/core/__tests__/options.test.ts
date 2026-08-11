import { describe, expect, it } from 'vitest';

import {
  normalizeImageRequest,
  normalizeMetadataSource,
  normalizeThumbnailRequest,
  normalizeVideoRequest,
} from '../options';

describe('compressor options', () => {
  it('applies stable image and video defaults', () => {
    expect(normalizeImageRequest('file://image.jpg', {}).options).toEqual({
      quality: 80,
      maxWidth: undefined,
      maxHeight: undefined,
    });
    expect(normalizeVideoRequest('file://video.mp4', {}).options).toEqual({
      maxDimension: 720,
      bitrate: undefined,
      fps: undefined,
    });
  });

  it('rejects remote files and invalid numeric boundaries', () => {
    expect(() =>
      normalizeMetadataSource('https://example.com/a.mp4'),
    ).toThrow();
    expect(() => normalizeImageRequest('a.jpg', { quality: 101 })).toThrow();
    expect(() => normalizeVideoRequest('a.mp4', { fps: 61 })).toThrow();
    expect(() => normalizeThumbnailRequest('a.mp4', { time: -1 })).toThrow();
  });
});
