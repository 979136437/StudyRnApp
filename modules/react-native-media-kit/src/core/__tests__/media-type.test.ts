import { describe, expect, it } from 'vitest';

import { inferMediaType } from '../media-type';

describe('媒体类型推断', () => {
  it('显式类型优先', () => {
    expect(
      inferMediaType({ uri: 'https://example.com/file.jpg', type: 'video' }),
    ).toBe('video');
  });

  it('忽略查询参数并按扩展名推断', () => {
    expect(inferMediaType('https://example.com/photo.HEIC?token=hidden')).toBe(
      'image',
    );
    expect(inferMediaType('file:///video.MP4#frame')).toBe('video');
  });

  it('未知扩展名要求调用者显式传入类型', () => {
    expect(() => inferMediaType('https://example.com/resource')).toThrow(
      '显式传入',
    );
  });
});
