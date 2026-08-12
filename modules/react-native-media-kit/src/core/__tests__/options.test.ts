import { describe, expect, it } from 'vitest';

import {
  normalizeImageOptions,
  normalizePageOptions,
  normalizeVideoOptions,
} from '../options';

describe('media-kit 参数', () => {
  it('应用分页默认值与边界', () => {
    expect(normalizePageOptions()).toMatchObject({ offset: 0, limit: 60 });
    expect(normalizePageOptions({ limit: 1 })).toMatchObject({ limit: 1 });
    expect(normalizePageOptions({ limit: 100 })).toMatchObject({ limit: 100 });
    expect(() => normalizePageOptions({ limit: 0 })).toThrow('limit');
    expect(() => normalizePageOptions({ limit: 101 })).toThrow('limit');
    expect(() => normalizePageOptions({ offset: 0.5 })).toThrow('offset');
  });

  it('应用图片与视频默认质量', () => {
    expect(normalizeImageOptions()).toEqual({
      quality: 80,
      maxWidth: undefined,
      maxHeight: undefined,
    });
    expect(normalizeVideoOptions()).toMatchObject({ quality: 'medium' });
    expect(() => normalizeImageOptions({ quality: 101 })).toThrow('quality');
    expect(() => normalizeVideoOptions({ resolution: 0 })).toThrow(
      'resolution',
    );
  });
});
