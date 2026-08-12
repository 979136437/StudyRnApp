import { MediaKitError, normalizeError, unavailable } from '../core/error';
import { imageMetadata, mapAsset, videoMetadata } from '../core/mapping';
import { inferMediaType } from '../core/media-type';
import {
  normalizeImageOptions,
  normalizePageOptions,
  normalizeSource,
  normalizeThumbnailOptions,
  normalizeTypes,
  normalizeUri,
  normalizeVideoOptions,
} from '../core/options';
import { createMediaTask, type TaskContext } from '../core/task';
import {
  forgetTemporary,
  isOwnedTemporary,
  isOwnedUri,
  markTemporary,
} from '../core/temporary-files';
import type {
  ImageOptions,
  ListMediaAssetsOptions,
  MediaFile,
  MediaLibraryPermissionOptions,
  MediaMetadata,
  MediaSource,
  PrepareMediaOptions,
  ThumbnailOptions,
  VideoOptions,
} from '../core/types';
import { compressorAdapter } from '../native/compressor';
import {
  copyToCache,
  deleteFile,
  downloadToCache,
  extensionFromUri,
  getFileSize,
  normalizeLocalUri,
} from '../native/file-system';
import { libraryAdapter } from '../native/media-library';
import { isWeb } from '../native/platform';
import { shareLocalFile } from '../native/sharing';

const remote = (uri: string) => /^https?:\/\//i.test(uri);

const cleanupUri = async (uri: string | undefined) => {
  if (!uri) return;
  try {
    await deleteFile(uri);
  } finally {
    forgetTemporary(uri);
  }
};

const assertPermission = (permission: { granted: boolean }) => {
  if (!permission.granted)
    throw new MediaKitError('PERMISSION_DENIED', '未获得相册权限');
};

const metadataFor = async (
  uri: string,
  type: 'image' | 'video',
): Promise<MediaMetadata> =>
  type === 'image'
    ? imageMetadata(await compressorAdapter.imageMetadata(uri))
    : videoMetadata(await compressorAdapter.videoMetadata(uri));

const toMediaFile = async (
  uri: string,
  type: 'image' | 'video',
  temporary: boolean,
  thumbnailUri?: string,
): Promise<MediaFile> => {
  const metadata = await metadataFor(uri, type);
  return { uri, type, ...metadata, thumbnailUri, temporary };
};

const runNativeTask = async <T extends { path: string }>(
  context: TaskContext,
  task: { result: Promise<T>; cancel(): boolean },
) => {
  context.onCancel(() => {
    task.cancel();
  });
  let result: T;
  try {
    result = await task.result;
  } catch (error) {
    context.throwIfCancelled();
    throw error;
  }
  const uri = markTemporary(normalizeLocalUri(result.path));
  if (context.cancelled) {
    await cleanupUri(uri);
    context.throwIfCancelled();
  }
  return { ...result, path: uri };
};

const prepareLocalSource = async (
  context: TaskContext,
  source: MediaSource,
) => {
  if (!remote(source.uri))
    return { uri: normalizeLocalUri(source.uri), temporary: false };
  const download = await downloadToCache(
    source.uri,
    extensionFromUri(source.uri, source.type === 'video' ? '.mp4' : '.jpg'),
  );
  context.onCancel(() => download.cancel());
  const uri = markTemporary(await download.result);
  if (context.cancelled) {
    await cleanupUri(uri);
    context.throwIfCancelled();
  }
  return { uri, temporary: true };
};

const createThumbnail = async (
  context: TaskContext,
  uri: string,
  options?: ThumbnailOptions,
) => {
  const result = await runNativeTask(
    context,
    compressorAdapter.createThumbnail(uri, normalizeThumbnailOptions(options)),
  );
  return result.path;
};

const compressPrepared = async (
  context: TaskContext,
  uri: string,
  type: 'image' | 'video',
  options: PrepareMediaOptions,
) => {
  if (!options.compress) return { uri, replaced: false };
  const task =
    type === 'image'
      ? compressorAdapter.compressImage(
          uri,
          normalizeImageOptions(options.image),
        )
      : compressorAdapter.compressVideo(
          uri,
          await mapVideoOptions(uri, options.video),
        );
  const result = await runNativeTask(context, task);
  return { uri: result.path, replaced: true };
};

const mapVideoOptions = async (uri: string, options?: VideoOptions) => {
  const normalized = normalizeVideoOptions(options);
  const metadata = await compressorAdapter.videoMetadata(uri);
  const sourceDimension = Math.max(metadata.width, metadata.height);
  return {
    maxDimension:
      normalized.maxDimension ??
      Math.max(
        2,
        Math.round(
          normalized.resolution !== undefined
            ? sourceDimension * normalized.resolution
            : { low: 480, medium: 720, high: 1080 }[normalized.quality],
        ),
      ),
    bitrate: normalized.bitrate,
    fps: normalized.fps,
  };
};

const prepareCopiedFile = (
  sourceUri: string,
  type: 'image' | 'video',
  options: PrepareMediaOptions = {},
) =>
  createMediaTask(async (context) => {
    let copied: string | undefined;
    let output: string | undefined;
    let thumbnail: string | undefined;
    try {
      context.throwIfCancelled();
      copied = markTemporary(
        await copyToCache(
          sourceUri,
          extensionFromUri(sourceUri, type === 'video' ? '.mp4' : '.jpg'),
        ),
      );
      if (context.cancelled) {
        await cleanupUri(copied);
        context.throwIfCancelled();
      }
      const compressed = await compressPrepared(context, copied, type, options);
      output = compressed.uri;
      if (compressed.replaced) await cleanupUri(copied);
      if (type === 'video' && options.createThumbnail !== false)
        thumbnail = await createThumbnail(context, output);
      return await toMediaFile(output, type, true, thumbnail);
    } catch (error) {
      await Promise.all([copied, output, thumbnail].map(cleanupUri));
      throw normalizeError(error, 'FILE_ERROR', '媒体文件准备失败');
    }
  });

export const getMediaLibraryPermission = async () =>
  libraryAdapter.getPermission(false, ['image', 'video']);

export const requestMediaLibraryPermission = async (
  options: MediaLibraryPermissionOptions = {},
) =>
  libraryAdapter.requestPermission(
    options.writeOnly ?? false,
    normalizeTypes(options.mediaTypes),
  );

export const listAlbums = async () => {
  assertPermission(await getMediaLibraryPermission());
  const albums = await libraryAdapter.listAlbums();
  return [
    { id: null, title: '最近项目', assetCount: 0, isRecent: true },
    ...albums.map((album) => ({
      id: album.id,
      title: album.title,
      assetCount: album.assetCount,
      isRecent: false,
    })),
  ];
};

export const listMediaAssets = async (
  rawOptions: ListMediaAssetsOptions = {},
) => {
  const options = normalizePageOptions(rawOptions);
  assertPermission(await getMediaLibraryPermission());
  const page = await libraryAdapter.listAssets(options);
  return {
    items: page.assets.map(mapAsset),
    nextOffset: page.hasNextPage ? options.offset + page.assets.length : null,
    hasMore: page.hasNextPage,
  };
};

export const getMediaAsset = async (id: string) => {
  const normalizedId = normalizeUri(id);
  assertPermission(await getMediaLibraryPermission());
  return mapAsset(await libraryAdapter.getAsset(normalizedId));
};

export const prepareMediaAsset = (id: string, options?: PrepareMediaOptions) =>
  createMediaTask(async (context) => {
    context.throwIfCancelled();
    const asset = await getMediaAsset(id);
    context.throwIfCancelled();
    const task = prepareCopiedFile(asset.uri, asset.type, options);
    context.onCancel(() => {
      task.cancel();
    });
    return task.result;
  });

export const prepareMediaFile = (
  uri: string,
  type: 'image' | 'video',
  options?: PrepareMediaOptions,
) => prepareCopiedFile(normalizeUri(uri), type, options);

export const compressImage = (uri: string, options?: ImageOptions) =>
  createMediaTask(async (context) => {
    let output: string | undefined;
    try {
      const result = await runNativeTask(
        context,
        compressorAdapter.compressImage(
          normalizeUri(uri),
          normalizeImageOptions(options),
        ),
      );
      output = result.path;
      return await toMediaFile(output, 'image', true);
    } catch (error) {
      await cleanupUri(output);
      throw normalizeError(error, 'COMPRESS_ERROR', '图片压缩失败');
    }
  });

export const compressVideo = (uri: string, options?: VideoOptions) =>
  createMediaTask(async (context) => {
    let output: string | undefined;
    let thumbnail: string | undefined;
    try {
      const source = normalizeUri(uri);
      const result = await runNativeTask(
        context,
        compressorAdapter.compressVideo(
          source,
          await mapVideoOptions(source, options),
        ),
      );
      output = result.path;
      thumbnail = await createThumbnail(context, output);
      return await toMediaFile(output, 'video', true, thumbnail);
    } catch (error) {
      await Promise.all([output, thumbnail].map(cleanupUri));
      throw normalizeError(error, 'COMPRESS_ERROR', '视频压缩失败');
    }
  });

export const getImageMetadata = async (uri: string) =>
  imageMetadata(await compressorAdapter.imageMetadata(normalizeUri(uri)));

export const getVideoMetadata = async (uri: string) =>
  videoMetadata(await compressorAdapter.videoMetadata(normalizeUri(uri)));

export const createVideoThumbnail = (uri: string, options?: ThumbnailOptions) =>
  createMediaTask(async (context) => {
    let output: string | undefined;
    try {
      const result = await runNativeTask(
        context,
        compressorAdapter.createThumbnail(
          normalizeUri(uri),
          normalizeThumbnailOptions(options),
        ),
      );
      output = result.path;
      return await toMediaFile(output, 'image', true);
    } catch (error) {
      await cleanupUri(output);
      throw normalizeError(error, 'FILE_ERROR', '视频缩略图创建失败');
    }
  });

export const preparePreviewSource = (source: string | MediaSource) =>
  createMediaTask(async (context) => {
    const normalized = normalizeSource(source);
    const type = inferMediaType(normalized);
    let prepared: { uri: string; temporary: boolean } | undefined;
    try {
      prepared = await prepareLocalSource(context, normalized);
      if (!prepared.temporary) {
        return {
          uri: prepared.uri,
          type,
          size: 0,
          width: 0,
          height: 0,
          duration: 0,
          fps: 0,
          bitrate: 0,
          temporary: false,
        };
      }
      const thumbnail =
        type === 'video'
          ? await createThumbnail(context, prepared.uri)
          : undefined;
      return await toMediaFile(
        prepared.uri,
        type,
        prepared.temporary,
        thumbnail,
      );
    } catch (error) {
      if (prepared?.temporary) await cleanupUri(prepared.uri);
      throw normalizeError(
        error,
        remote(normalized.uri) ? 'DOWNLOAD_ERROR' : 'FILE_ERROR',
        '预览资源准备失败',
      );
    }
  });

const withPreparedSource = (
  source: string | MediaSource,
  operation: (uri: string) => Promise<void>,
  errorCode: 'FILE_ERROR' | 'SHARE_ERROR',
  message: string,
) =>
  createMediaTask(async (context) => {
    const task = preparePreviewSource(source);
    context.onCancel(() => {
      task.cancel();
    });
    let file: MediaFile | undefined;
    try {
      file = await task.result;
      context.throwIfCancelled();
      await operation(file.uri);
      context.throwIfCancelled();
    } catch (error) {
      throw normalizeError(error, errorCode, message);
    } finally {
      if (file?.temporary) await removeTemporaryFiles([file]);
    }
  });

export const saveToMediaLibrary = (source: string | MediaSource) =>
  isWeb()
    ? createMediaTask(async () => {
        throw unavailable('保存到相册');
      })
    : withPreparedSource(
        source,
        libraryAdapter.save,
        'FILE_ERROR',
        '保存媒体失败',
      );

export const shareMedia = (source: string | MediaSource) =>
  isWeb()
    ? createMediaTask(async () => {
        throw unavailable('媒体分享');
      })
    : withPreparedSource(source, shareLocalFile, 'SHARE_ERROR', '分享媒体失败');

export const removeTemporaryFiles = async (files: readonly MediaFile[]) => {
  const targets = files
    .flatMap((file) => [
      isOwnedTemporary(file) ? file.uri : undefined,
      isOwnedUri(file.thumbnailUri) ? file.thumbnailUri : undefined,
    ])
    .filter((uri): uri is string => Boolean(uri));
  await Promise.all([...new Set(targets)].map(cleanupUri));
};

export { inferMediaType };
