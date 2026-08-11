import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cancelCompression: vi.fn(),
  compressImage: vi.fn(),
  compressVideo: vi.fn(),
  createVideoThumbnail: vi.fn(),
  getImageMetadata: vi.fn(),
  getVideoMetadata: vi.fn(),
}));

vi.mock('expo-file-system', () => ({
  File: class {
    size = 0;
  },
}));

vi.mock('react-native-nitro-compressor', () => mocks);

import {
  cancelVideoCompression,
  executeCompressImage,
  executeCompressVideo,
} from '../compression';

describe('media compression adapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps image options and exposes the cancellation id', async () => {
    mocks.compressImage.mockReturnValue({
      id: 'image-task',
      result: Promise.resolve({ path: 'file://compressed.jpg' }),
      cancel: vi.fn(),
    });
    const register = vi.fn();

    await expect(
      executeCompressImage(
        {
          src: 'file://source.jpg',
          quality: 75,
          compressedWidth: 640,
        },
        register,
      ),
    ).resolves.toBe('file://compressed.jpg');
    expect(mocks.compressImage).toHaveBeenCalledWith('file://source.jpg', {
      quality: 75,
      maxWidth: 640,
      maxHeight: undefined,
    });
    expect(register).toHaveBeenCalledWith('image-task');
  });

  it('maps video quality, bitrate and fps to Nitro units', async () => {
    mocks.getVideoMetadata.mockResolvedValue({ width: 1920, height: 1080 });
    mocks.compressVideo.mockReturnValue({
      id: 'video-task',
      result: Promise.resolve({ path: 'file://compressed.mp4', size: 2049 }),
      cancel: vi.fn(),
    });
    const register = vi.fn();

    await expect(
      executeCompressVideo(
        {
          src: 'file://source.mp4',
          quality: 'low',
          bitrate: 900,
          fps: 35,
        },
        register,
      ),
    ).resolves.toEqual({
      tempFilePath: 'file://compressed.mp4',
      size: 3,
      cancellationId: 'video-task',
    });
    expect(mocks.compressVideo).toHaveBeenCalledWith('file://source.mp4', {
      maxDimension: 480,
      bitrate: 900_000,
      fps: 35,
    });
    expect(register).toHaveBeenCalledWith('video-task');
  });

  it('forwards cancellation to the native task registry', () => {
    cancelVideoCompression('task-id');
    expect(mocks.cancelCompression).toHaveBeenCalledWith('task-id');
  });
});
