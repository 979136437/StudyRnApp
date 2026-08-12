import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  permission: vi.fn(),
  requestPermission: vi.fn(),
  listAlbums: vi.fn(),
  listAssets: vi.fn(),
  getAsset: vi.fn(),
  save: vi.fn(),
  copy: vi.fn(),
  download: vi.fn(),
  size: vi.fn(),
  remove: vi.fn(),
  imageMetadata: vi.fn(),
  videoMetadata: vi.fn(),
  imageCompress: vi.fn(),
  videoCompress: vi.fn(),
  thumbnail: vi.fn(),
  share: vi.fn(),
}));

vi.mock('../../native/media-library', () => ({
  libraryAdapter: {
    getPermission: mocks.permission,
    requestPermission: mocks.requestPermission,
    listAlbums: mocks.listAlbums,
    listAssets: mocks.listAssets,
    getAsset: mocks.getAsset,
    save: mocks.save,
  },
}));
vi.mock('../../native/file-system', () => ({
  copyToCache: mocks.copy,
  downloadToCache: mocks.download,
  getFileSize: mocks.size,
  deleteFile: mocks.remove,
  normalizeLocalUri: (uri: string) => uri,
  extensionFromUri: () => '.jpg',
}));
vi.mock('../../native/compressor', () => ({
  compressorAdapter: {
    imageMetadata: mocks.imageMetadata,
    videoMetadata: mocks.videoMetadata,
    compressImage: mocks.imageCompress,
    compressVideo: mocks.videoCompress,
    createThumbnail: mocks.thumbnail,
  },
}));
vi.mock('../../native/sharing', () => ({ shareLocalFile: mocks.share }));

import {
  compressImage,
  compressVideo,
  getMediaAsset,
  listAlbums,
  listMediaAssets,
  prepareMediaAsset,
  preparePreviewSource,
  removeTemporaryFiles,
  requestMediaLibraryPermission,
  saveToMediaLibrary,
  shareMedia,
} from '../media-kit';

const nativeAsset = {
  id: 'asset-1',
  mediaType: 'photo',
  width: 100,
  height: 80,
  duration: 0,
  creationTime: 10,
  uri: 'ph://asset-1',
  localUri: 'file:///original.jpg',
};
const imageInfo = { size: 120, width: 100, height: 80 };
const task = <T>(id: string, value: T) => ({
  id,
  result: Promise.resolve(value),
  cancel: vi.fn(() => true),
});

describe('media-kit 公开编排', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ granted: true });
    mocks.requestPermission.mockResolvedValue({
      granted: true,
      status: 'granted',
      canAskAgain: true,
      access: 'all',
    });
    mocks.getAsset.mockResolvedValue(nativeAsset);
    mocks.imageMetadata.mockResolvedValue(imageInfo);
    mocks.videoMetadata.mockResolvedValue({
      ...imageInfo,
      duration: 4,
      fps: 30,
      bitrate: 400000,
    });
    mocks.remove.mockResolvedValue(undefined);
  });

  it('映射权限、最近项目、分页和可导出原图', async () => {
    await requestMediaLibraryPermission({ mediaTypes: ['image'] });
    expect(mocks.requestPermission).toHaveBeenCalledWith(false, ['image']);
    mocks.listAlbums.mockResolvedValue([
      { id: 'album-1', title: '相机', assetCount: 2 },
    ]);
    await expect(listAlbums()).resolves.toEqual([
      { id: null, title: '最近项目', assetCount: 0, isRecent: true },
      { id: 'album-1', title: '相机', assetCount: 2, isRecent: false },
    ]);
    mocks.listAssets.mockResolvedValue({
      assets: [nativeAsset],
      hasNextPage: true,
    });
    await expect(
      listMediaAssets({ offset: 60, limit: 20 }),
    ).resolves.toMatchObject({ nextOffset: 61, hasMore: true });
    await expect(getMediaAsset('asset-1')).resolves.toMatchObject({
      uri: 'file:///original.jpg',
      type: 'image',
    });
  });

  it('准备相册原件并映射图片压缩结果', async () => {
    mocks.copy.mockResolvedValue('file:///cache/source.jpg');
    await expect(prepareMediaAsset('asset-1').result).resolves.toMatchObject({
      uri: 'file:///cache/source.jpg',
      temporary: true,
      size: 120,
    });
    mocks.imageCompress.mockReturnValue(
      task('compress-1', { path: 'file:///cache/output.jpg' }),
    );
    await expect(
      compressImage('file:///source.jpg').result,
    ).resolves.toMatchObject({
      uri: 'file:///cache/output.jpg',
      type: 'image',
      temporary: true,
    });
    expect(mocks.imageCompress).toHaveBeenCalledWith('file:///source.jpg', {
      quality: 80,
      maxWidth: undefined,
      maxHeight: undefined,
    });
  });

  it('映射视频质量、元数据与缩略图', async () => {
    mocks.videoCompress.mockReturnValue(
      task('video-1', { path: 'file:///cache/output.mp4' }),
    );
    mocks.thumbnail.mockReturnValue(
      task('thumb-1', { path: 'file:///cache/thumb.jpg' }),
    );
    const result = await compressVideo('file:///source.mp4', {
      quality: 'high',
      fps: 24,
    }).result;
    expect(mocks.videoCompress).toHaveBeenCalledWith('file:///source.mp4', {
      maxDimension: 1080,
      bitrate: undefined,
      fps: 24,
    });
    expect(result).toMatchObject({
      duration: 4,
      fps: 30,
      bitrate: 400000,
      thumbnailUri: 'file:///cache/thumb.jpg',
    });
  });

  it('下载远程预览并在保存、分享后回收缓存', async () => {
    mocks.download.mockResolvedValue({
      result: Promise.resolve('file:///cache/remote.jpg'),
      cancel: vi.fn(),
    });
    const preview = await preparePreviewSource('https://example.com/photo.jpg')
      .result;
    expect(preview).toMatchObject({
      uri: 'file:///cache/remote.jpg',
      temporary: true,
    });
    await removeTemporaryFiles([preview]);
    expect(mocks.remove).toHaveBeenCalledWith('file:///cache/remote.jpg');

    mocks.download.mockResolvedValue({
      result: Promise.resolve('file:///cache/save.jpg'),
      cancel: vi.fn(),
    });
    await saveToMediaLibrary('https://example.com/save.jpg').result;
    expect(mocks.save).toHaveBeenCalledWith('file:///cache/save.jpg');
    mocks.download.mockResolvedValue({
      result: Promise.resolve('file:///cache/share.jpg'),
      cancel: vi.fn(),
    });
    await shareMedia('https://example.com/share.jpg').result;
    expect(mocks.share).toHaveBeenCalledWith('file:///cache/share.jpg');
  });

  it('不会删除调用者原文件或伪造的临时文件', async () => {
    await removeTemporaryFiles([
      {
        uri: 'file:///user.jpg',
        type: 'image',
        size: 1,
        width: 1,
        height: 1,
        duration: 0,
        fps: 0,
        bitrate: 0,
        temporary: true,
      },
    ]);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('Web 保存与分享在下载前返回 UNAVAILABLE', async () => {
    const original = process.env.EXPO_OS;
    process.env.EXPO_OS = 'web';
    await expect(
      saveToMediaLibrary('https://example.com/save.jpg').result,
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(
      shareMedia('https://example.com/share.jpg').result,
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(mocks.download).not.toHaveBeenCalled();
    process.env.EXPO_OS = original;
  });

  it('复制完成后取消会回收产物', async () => {
    let resolveCopy!: (uri: string) => void;
    mocks.copy.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveCopy = resolve;
      }),
    );
    const operation = prepareMediaAsset('asset-1');
    await vi.waitFor(() => expect(mocks.copy).toHaveBeenCalledOnce());
    expect(operation.cancel()).toBe(true);
    resolveCopy('file:///cache/cancelled.jpg');
    await expect(operation.result).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(mocks.remove).toHaveBeenCalledWith('file:///cache/cancelled.jpg');
  });
});
