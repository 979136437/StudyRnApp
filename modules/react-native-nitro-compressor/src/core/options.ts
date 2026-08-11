import type {
  ImageCompressionOptions,
  ThumbnailOptions,
  VideoCompressionOptions,
} from '../specs/Compressor.nitro';
import { CompressorError } from '../types';

const assertSource = (source: string) => {
  const value = source.trim();
  if (!value) {
    throw new CompressorError('INVALID_ARGUMENT', '媒体路径不能为空');
  }
  if (/^https?:\/\//i.test(value)) {
    throw new CompressorError('INVALID_ARGUMENT', '压缩仅支持本地媒体文件');
  }
  return value;
};

const assertFinite = (
  name: string,
  value: number,
  min: number,
  max?: number,
) => {
  if (
    !Number.isFinite(value) ||
    value < min ||
    (max !== undefined && value > max)
  ) {
    throw new CompressorError('INVALID_ARGUMENT', `${name} 参数超出有效范围`);
  }
};

export const normalizeImageRequest = (
  source: string,
  options: Partial<ImageCompressionOptions> = {},
) => {
  const quality = options.quality ?? 80;
  assertFinite('quality', quality, 0, 100);
  if (options.maxWidth !== undefined)
    assertFinite('maxWidth', options.maxWidth, 1);
  if (options.maxHeight !== undefined)
    assertFinite('maxHeight', options.maxHeight, 1);
  return {
    source: assertSource(source),
    options: {
      quality,
      maxWidth: options.maxWidth,
      maxHeight: options.maxHeight,
    },
  };
};

export const normalizeVideoRequest = (
  source: string,
  options: Partial<VideoCompressionOptions> = {},
) => {
  const maxDimension = options.maxDimension ?? 720;
  assertFinite('maxDimension', maxDimension, 2);
  if (options.bitrate !== undefined)
    assertFinite('bitrate', options.bitrate, 1);
  if (options.fps !== undefined) assertFinite('fps', options.fps, 1, 60);
  return {
    source: assertSource(source),
    options: { maxDimension, bitrate: options.bitrate, fps: options.fps },
  };
};

export const normalizeThumbnailRequest = (
  source: string,
  options: Partial<ThumbnailOptions> = {},
) => {
  const time = options.time ?? 0;
  const quality = options.quality ?? 80;
  assertFinite('time', time, 0);
  assertFinite('quality', quality, 0, 100);
  if (options.maxWidth !== undefined)
    assertFinite('maxWidth', options.maxWidth, 1);
  return {
    source: assertSource(source),
    options: { time, quality, maxWidth: options.maxWidth },
  };
};

export const normalizeMetadataSource = assertSource;
