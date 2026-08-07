import { describe, expect, it } from 'vitest';

import { resolveVideoSource } from '../video-source';

const REMOTE_URI = 'https://example.test/video.mp4';

describe('视频播放源', () => {
  it('缓存开启时为远程视频启用原生分段缓存', () => {
    expect(
      resolveVideoSource({
        cache: true,
        requestHeaders: { Authorization: 'Bearer test-token' },
        resolvedUri: REMOTE_URI,
        sourceUri: REMOTE_URI,
      }),
    ).toEqual({
      headers: { Authorization: 'Bearer test-token' },
      uri: REMOTE_URI,
      useCaching: true,
    });
  });

  it('缓存关闭时不启用原生分段缓存', () => {
    expect(
      resolveVideoSource({
        cache: false,
        resolvedUri: REMOTE_URI,
        sourceUri: REMOTE_URI,
      }),
    ).toMatchObject({ useCaching: false });
  });

  it('本地缓存文件不重复缓存且不携带远程请求头', () => {
    expect(
      resolveVideoSource({
        cache: true,
        requestHeaders: { Authorization: 'Bearer test-token' },
        resolvedUri: 'file:///cache/video.mp4',
        sourceUri: REMOTE_URI,
      }),
    ).toEqual({
      headers: undefined,
      uri: 'file:///cache/video.mp4',
      useCaching: false,
    });
  });

  it('缓存地址尚未解析时不创建播放源', () => {
    expect(
      resolveVideoSource({
        cache: true,
        resolvedUri: null,
        sourceUri: REMOTE_URI,
      }),
    ).toBeNull();
  });
});
