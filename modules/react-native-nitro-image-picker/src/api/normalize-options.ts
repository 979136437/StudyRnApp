import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../core/constants';
import { normalizeInteger } from '../core/normalize-integer';
import type {
  AlbumQueryOptions as NativeAlbumQueryOptions,
  AssetQueryOptions as NativeAssetQueryOptions,
  CameraOptions as NativeCameraOptions,
  ImageLibraryOptions,
  MediaTypeOptions,
  ResolveAssetsOptions as NativeResolveAssetsOptions,
} from '../specs/ImagePicker.nitro';
import { NitroImagePickerError } from '../types';
import type {
  AlbumQueryOptions,
  AssetQueryOptions,
  CameraOptions,
  ImagePickerOptions,
  MediaTypeOption,
  ResolveAssetsOptions,
} from '../types';

const VALID_MEDIA_TYPES = new Set<MediaTypeOption>(['images', 'videos']);

function normalizeOptionInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  field: string,
): number {
  try {
    return normalizeInteger(value, fallback, minimum, maximum, field);
  } catch (error) {
    throw new NitroImagePickerError(
      'E_INVALID_OPTIONS',
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? { cause: error } : undefined,
    );
  }
}

export function normalizeMediaTypes(
  mediaTypes?: MediaTypeOption[],
): MediaTypeOption[] {
  const requested: MediaTypeOption[] = mediaTypes?.length
    ? mediaTypes
    : ['images', 'videos'];
  const normalized = [...new Set(requested)];
  if (normalized.some((type) => !VALID_MEDIA_TYPES.has(type))) {
    throw new NitroImagePickerError(
      'E_INVALID_OPTIONS',
      'mediaTypes 包含不支持的值',
    );
  }
  return normalized;
}

export function normalizeMediaTypeOptions(
  mediaTypes?: MediaTypeOption[],
): MediaTypeOptions {
  return { mediaTypes: normalizeMediaTypes(mediaTypes) };
}

export function normalizeAlbumOptions(
  options: AlbumQueryOptions = {},
): NativeAlbumQueryOptions {
  return {
    mediaTypes: normalizeMediaTypes(options.mediaTypes),
    includeSmartAlbums: options.includeSmartAlbums ?? true,
  };
}

export function normalizeAssetOptions(
  options: AssetQueryOptions = {},
): NativeAssetQueryOptions {
  return {
    albumId: options.albumId,
    mediaTypes: normalizeMediaTypes(options.mediaTypes),
    first: normalizeOptionInteger(
      options.first,
      DEFAULT_PAGE_SIZE,
      1,
      MAX_PAGE_SIZE,
      'first',
    ),
    after: options.after,
  };
}

export function normalizeImagePickerOptions(
  options: ImagePickerOptions = {},
): ImageLibraryOptions {
  const allowsMultipleSelection = options.allowsMultipleSelection ?? false;
  const selectionLimit = allowsMultipleSelection
    ? normalizeOptionInteger(
        options.selectionLimit,
        0,
        0,
        MAX_PAGE_SIZE,
        'selectionLimit',
      )
    : 1;
  return {
    mediaTypes: normalizeMediaTypes(options.mediaTypes),
    allowsMultipleSelection,
    selectionLimit,
    orderedSelection: options.orderedSelection ?? allowsMultipleSelection,
    shouldDownloadFromNetwork: options.shouldDownloadFromNetwork ?? false,
  };
}

export function normalizeCameraOptions(
  options: CameraOptions = {},
): NativeCameraOptions {
  const duration = options.videoMaxDuration ?? 0;
  if (!Number.isFinite(duration) || duration < 0) {
    throw new NitroImagePickerError(
      'E_INVALID_OPTIONS',
      'videoMaxDuration 必须是大于或等于 0 的有限数字',
    );
  }
  return {
    mediaType: options.mediaType ?? 'image',
    cameraType: options.cameraType ?? 'back',
    videoMaxDuration: Math.trunc(duration),
  };
}

export function normalizeResolveOptions(
  options: ResolveAssetsOptions = {},
): NativeResolveAssetsOptions {
  return {
    shouldDownloadFromNetwork: options.shouldDownloadFromNetwork ?? false,
  };
}
