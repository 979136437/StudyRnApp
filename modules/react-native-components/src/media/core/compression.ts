import { File } from 'expo-file-system';
import {
  cancelCompression,
  compressImage as compressNativeImage,
  compressVideo as compressNativeVideo,
  createVideoThumbnail,
  getImageMetadata,
  getVideoMetadata,
} from 'react-native-nitro-compressor';

import type { CompressImageOptions, CompressVideoOptions } from '../types';
import { MediaApiError } from '../types';
import {
  BYTES_PER_KILOBYTE,
  KILOBITS_TO_BITS,
  VIDEO_MAX_SIZE,
} from './constants';
import { normalizeImageOptions, normalizeVideoOptions } from './options';

export const executeCompressImage = async (
  rawOptions: CompressImageOptions,
  onCancellationId?: (id: string) => void,
) => {
  const options = normalizeImageOptions(rawOptions);
  const task = compressNativeImage(options.src, {
    quality: options.quality,
    maxWidth: options.compressedWidth,
    maxHeight: options.compressedHeight,
  });
  onCancellationId?.(task.id);
  try {
    return (await task.result).path;
  } catch (error) {
    task.cancel();
    throw new MediaApiError('COMPRESS_ERROR', '图片压缩失败', error);
  }
};

export const executeCompressVideo = async (
  rawOptions: CompressVideoOptions,
  onCancellationId?: (id: string) => void,
) => {
  const options = normalizeVideoOptions(rawOptions);
  try {
    const metadata = await getVideoMetadata(options.src);
    const sourceEdge = Math.max(metadata.width, metadata.height);
    const maxSize = options.quality
      ? VIDEO_MAX_SIZE[options.quality]
      : Math.max(1, Math.round(sourceEdge * (options.resolution ?? 1)));
    const task = compressNativeVideo(options.src, {
      maxDimension: maxSize,
      bitrate: options.bitrate ? options.bitrate * KILOBITS_TO_BITS : undefined,
      fps: options.fps,
    });
    onCancellationId?.(task.id);
    const result = await task.result;
    return {
      tempFilePath: result.path,
      size: Math.ceil(result.size / BYTES_PER_KILOBYTE),
      cancellationId: task.id,
    };
  } catch (error) {
    throw new MediaApiError('COMPRESS_ERROR', '视频压缩失败', error);
  }
};

export const cancelVideoCompression = (cancellationId: string) => {
  cancelCompression(cancellationId);
};

export const readMediaFile = async (
  path: string,
  type: 'image' | 'video',
  onCancellationId?: (id: string) => void,
) => {
  const file = new File(path);
  if (type === 'image') {
    const metadata = await getImageMetadata(path);
    return {
      size: file.size ?? metadata.size ?? 0,
      width: metadata.width,
      height: metadata.height,
    };
  }
  const metadata = await getVideoMetadata(path);
  let thumbTempFilePath: string | undefined;
  try {
    const task = createVideoThumbnail(path);
    onCancellationId?.(task.id);
    thumbTempFilePath = (await task.result).path;
  } catch {
    // 缩略图失败不应使已选择的视频失效。
  }
  return {
    size: file.size ?? metadata.size ?? 0,
    width: metadata.width,
    height: metadata.height,
    duration: metadata.duration,
    thumbTempFilePath,
  };
};
