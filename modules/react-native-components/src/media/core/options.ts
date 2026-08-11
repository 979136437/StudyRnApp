import type {
  ChooseMediaOptions,
  CompressImageOptions,
  CompressVideoOptions,
  PreviewMediaOptions,
} from '../types';
import { MediaApiError } from '../types';
import { DEFAULT_VIDEO_QUALITY, MEDIA_LIMITS } from './constants';

const assertNumberInRange = (
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
    throw new MediaApiError('INVALID_ARGUMENT', `${name} 参数超出有效范围`);
  }
};

export const normalizeChooseOptions = (options: ChooseMediaOptions = {}) => {
  const count = options.count ?? MEDIA_LIMITS.count.default;
  if (!Number.isInteger(count)) {
    throw new MediaApiError('INVALID_ARGUMENT', 'count 必须是整数');
  }
  assertNumberInRange(
    'count',
    count,
    MEDIA_LIMITS.count.min,
    MEDIA_LIMITS.count.max,
  );
  const maxDuration = options.maxDuration ?? MEDIA_LIMITS.duration.default;
  assertNumberInRange(
    'maxDuration',
    maxDuration,
    MEDIA_LIMITS.duration.min,
    MEDIA_LIMITS.duration.max,
  );

  const mediaType = options.mediaType ?? ['image', 'video'];
  const sourceType = options.sourceType ?? ['album', 'camera'];
  const sizeType = options.sizeType ?? ['original', 'compressed'];
  if (
    !mediaType.length ||
    mediaType.some((value) => value !== 'image' && value !== 'video')
  ) {
    throw new MediaApiError('INVALID_ARGUMENT', 'mediaType 参数无效');
  }
  if (
    !sourceType.length ||
    sourceType.some((value) => value !== 'album' && value !== 'camera')
  ) {
    throw new MediaApiError('INVALID_ARGUMENT', 'sourceType 参数无效');
  }
  if (
    !sizeType.length ||
    sizeType.some((value) => value !== 'original' && value !== 'compressed')
  ) {
    throw new MediaApiError('INVALID_ARGUMENT', 'sizeType 参数无效');
  }
  if (
    options.camera !== undefined &&
    options.camera !== 'front' &&
    options.camera !== 'back'
  ) {
    throw new MediaApiError('INVALID_ARGUMENT', 'camera 参数无效');
  }

  return {
    count,
    mediaType: [...new Set(mediaType)],
    sourceType: [...new Set(sourceType)],
    maxDuration,
    sizeType: [...new Set(sizeType)],
    camera: options.camera ?? 'back',
  };
};

export const normalizePreviewOptions = (options: PreviewMediaOptions) => {
  if (
    !options?.sources?.length ||
    options.sources.some((source) => !source.url.trim())
  ) {
    throw new MediaApiError(
      'INVALID_ARGUMENT',
      'sources 至少包含一个有效媒体地址',
    );
  }
  const current = options.current ?? 0;
  if (
    !Number.isInteger(current) ||
    current < 0 ||
    current >= options.sources.length
  ) {
    throw new MediaApiError('INVALID_ARGUMENT', 'current 超出 sources 范围');
  }
  return {
    sources: options.sources,
    current,
    showmenu: options.showmenu ?? true,
  };
};

export const normalizeImageOptions = (options: CompressImageOptions) => {
  if (!options?.src?.trim())
    throw new MediaApiError('INVALID_ARGUMENT', 'src 不能为空');
  const quality = options.quality ?? MEDIA_LIMITS.imageQuality.default;
  assertNumberInRange(
    'quality',
    quality,
    MEDIA_LIMITS.imageQuality.min,
    MEDIA_LIMITS.imageQuality.max,
  );
  if (options.compressedWidth !== undefined)
    assertNumberInRange('compressedWidth', options.compressedWidth, 1);
  if (options.compressedHeight !== undefined)
    assertNumberInRange('compressedHeight', options.compressedHeight, 1);
  return {
    src: options.src,
    quality,
    compressedWidth: options.compressedWidth,
    compressedHeight: options.compressedHeight,
  };
};

export const normalizeVideoOptions = (options: CompressVideoOptions) => {
  if (!options?.src?.trim())
    throw new MediaApiError('INVALID_ARGUMENT', 'src 不能为空');
  if (options.bitrate !== undefined)
    assertNumberInRange('bitrate', options.bitrate, 1);
  if (options.fps !== undefined) assertNumberInRange('fps', options.fps, 1);
  if (options.resolution !== undefined)
    assertNumberInRange('resolution', options.resolution, Number.EPSILON, 1);
  const quality =
    options.quality ??
    (options.bitrate || options.resolution ? undefined : DEFAULT_VIDEO_QUALITY);
  return {
    src: options.src,
    quality,
    bitrate: options.bitrate,
    fps: options.fps,
    resolution: options.resolution,
  };
};
