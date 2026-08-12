import { MediaKitError } from './error';
import type {
  ImageOptions,
  ListMediaAssetsOptions,
  MediaSource,
  MediaType,
  ThumbnailOptions,
  VideoOptions,
} from './types';

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
    throw new MediaKitError('INVALID_ARGUMENT', `${name}参数超出有效范围`);
  }
};

export const normalizeUri = (uri: string) => {
  const value = uri?.trim();
  if (!value) throw new MediaKitError('INVALID_ARGUMENT', '媒体 URI 不能为空');
  return value;
};

export const normalizeTypes = (types: MediaType[] | undefined) => {
  const values = types ?? ['image', 'video'];
  if (
    !values.length ||
    values.some((type) => type !== 'image' && type !== 'video')
  ) {
    throw new MediaKitError('INVALID_ARGUMENT', 'mediaTypes 参数无效');
  }
  return [...new Set(values)];
};

export const normalizePageOptions = (options: ListMediaAssetsOptions = {}) => {
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 60;
  if (!Number.isInteger(offset))
    throw new MediaKitError('INVALID_ARGUMENT', 'offset 必须是整数');
  if (!Number.isInteger(limit))
    throw new MediaKitError('INVALID_ARGUMENT', 'limit 必须是整数');
  assertFinite('offset', offset, 0);
  assertFinite('limit', limit, 1, 100);
  if (
    options.albumId !== undefined &&
    options.albumId !== null &&
    !options.albumId.trim()
  ) {
    throw new MediaKitError('INVALID_ARGUMENT', 'albumId 不能为空');
  }
  return {
    albumId: options.albumId ?? null,
    mediaTypes: normalizeTypes(options.mediaTypes),
    offset,
    limit,
  };
};

export const normalizeImageOptions = (options: ImageOptions = {}) => {
  const quality = options.quality ?? 80;
  assertFinite('quality', quality, 0, 100);
  if (options.maxWidth !== undefined)
    assertFinite('maxWidth', options.maxWidth, 1);
  if (options.maxHeight !== undefined)
    assertFinite('maxHeight', options.maxHeight, 1);
  return { quality, maxWidth: options.maxWidth, maxHeight: options.maxHeight };
};

const QUALITY_DIMENSIONS = { low: 480, medium: 720, high: 1080 } as const;

export const normalizeVideoOptions = (options: VideoOptions = {}) => {
  const quality = options.quality ?? 'medium';
  if (!(quality in QUALITY_DIMENSIONS))
    throw new MediaKitError('INVALID_ARGUMENT', 'quality 参数无效');
  if (options.bitrate !== undefined)
    assertFinite('bitrate', options.bitrate, 1);
  if (options.fps !== undefined) assertFinite('fps', options.fps, 1, 60);
  if (options.resolution !== undefined)
    assertFinite('resolution', options.resolution, Number.EPSILON, 1);
  if (options.maxDimension !== undefined)
    assertFinite('maxDimension', options.maxDimension, 2);
  return {
    quality,
    bitrate: options.bitrate,
    fps: options.fps,
    resolution: options.resolution,
    maxDimension: options.maxDimension,
  };
};

export const normalizeThumbnailOptions = (options: ThumbnailOptions = {}) => {
  const time = options.time ?? 0;
  const quality = options.quality ?? 80;
  assertFinite('time', time, 0);
  assertFinite('quality', quality, 0, 100);
  if (options.maxWidth !== undefined)
    assertFinite('maxWidth', options.maxWidth, 1);
  return { time, quality, maxWidth: options.maxWidth };
};

export const normalizeSource = (source: string | MediaSource): MediaSource =>
  typeof source === 'string'
    ? { uri: normalizeUri(source) }
    : { uri: normalizeUri(source?.uri), type: source.type };
