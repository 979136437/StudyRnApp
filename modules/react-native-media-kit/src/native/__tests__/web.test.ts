import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native-nitro-compressor', () => ({
  compressImage: vi.fn(),
  compressVideo: vi.fn(),
  createVideoThumbnail: vi.fn(),
  getImageMetadata: vi.fn(),
  getVideoMetadata: vi.fn(),
}));
vi.mock('expo-media-library', () => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
}));
vi.mock('expo-media-library/legacy', () => ({}));
vi.mock('expo-sharing', () => ({
  isAvailableAsync: vi.fn(),
  shareAsync: vi.fn(),
}));

import { compressorAdapter } from '../compressor';
import { libraryAdapter } from '../media-library';
import { shareLocalFile } from '../sharing';

describe('Web 平台边界', () => {
  const original = process.env.EXPO_OS;
  afterEach(() => {
    process.env.EXPO_OS = original;
  });

  it('相册、保存、分享与原生压缩返回 UNAVAILABLE', async () => {
    process.env.EXPO_OS = 'web';
    await expect(libraryAdapter.listAlbums()).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await expect(
      libraryAdapter.save('file:///media.jpg'),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(shareLocalFile('file:///media.jpg')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    expect(() =>
      compressorAdapter.compressImage('file:///media.jpg', {}),
    ).toThrow(expect.objectContaining({ code: 'UNAVAILABLE' }));
  });
});
