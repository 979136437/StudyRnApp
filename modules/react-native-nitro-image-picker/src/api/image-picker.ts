import { nativeImagePicker } from '../native/native-module';
import type {
  ImagePickerErrorResult,
  ImagePickerResult as NativeImagePickerResult,
} from '../specs/ImagePicker.nitro';
import { NitroImagePickerError } from '../types';
import type {
  AlbumQueryOptions,
  AssetQueryOptions,
  CameraOptions,
  ImagePickerOptions,
  ImagePickerResult,
  MediaLibraryChangeEvent,
  MediaTypeOption,
  ResolveAssetsOptions,
} from '../types';
import {
  normalizeAlbumOptions,
  normalizeAssetOptions,
  normalizeCameraOptions,
  normalizeImagePickerOptions,
  normalizeMediaTypeOptions,
  normalizeResolveOptions,
} from './normalize-options';

const ERROR_PATTERN = /\[(E_[A-Z_]+)]\s*(.*)/s;

function normalizeError(error: unknown): NitroImagePickerError {
  if (error instanceof NitroImagePickerError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const match = ERROR_PATTERN.exec(message);
  const code = match?.[1] ?? 'E_UNKNOWN';
  return new NitroImagePickerError(
    code as NitroImagePickerError['code'],
    match?.[2] || message,
    error instanceof Error ? { cause: error } : undefined,
  );
}

async function callNative<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw normalizeError(error);
  }
}

function normalizeResult(result: NativeImagePickerResult): ImagePickerResult {
  if (result.canceled) return { canceled: true, assets: null };
  return { canceled: false, assets: result.assets ?? [] };
}

export const getMediaLibraryPermissionsAsync = (
  mediaTypes?: MediaTypeOption[],
) =>
  callNative(() =>
    nativeImagePicker.getMediaLibraryPermissionsAsync(
      normalizeMediaTypeOptions(mediaTypes),
    ),
  );

export const requestMediaLibraryPermissionsAsync = (
  mediaTypes?: MediaTypeOption[],
) =>
  callNative(() =>
    nativeImagePicker.requestMediaLibraryPermissionsAsync(
      normalizeMediaTypeOptions(mediaTypes),
    ),
  );

export const getCameraPermissionsAsync = () =>
  callNative(() => nativeImagePicker.getCameraPermissionsAsync());
export const requestCameraPermissionsAsync = () =>
  callNative(() => nativeImagePicker.requestCameraPermissionsAsync());
export const getMicrophonePermissionsAsync = () =>
  callNative(() => nativeImagePicker.getMicrophonePermissionsAsync());
export const requestMicrophonePermissionsAsync = () =>
  callNative(() => nativeImagePicker.requestMicrophonePermissionsAsync());

export const presentLimitedLibraryPickerAsync = (
  mediaTypes?: MediaTypeOption[],
) =>
  callNative(() =>
    nativeImagePicker.presentLimitedLibraryPickerAsync(
      normalizeMediaTypeOptions(mediaTypes),
    ),
  );

export const getAlbumsAsync = (options: AlbumQueryOptions = {}) =>
  callNative(() =>
    nativeImagePicker.getAlbumsAsync(normalizeAlbumOptions(options)),
  );

export const getAssetsAsync = (options: AssetQueryOptions = {}) =>
  callNative(() =>
    nativeImagePicker.getAssetsAsync(normalizeAssetOptions(options)),
  );

export const resolveAssetsAsync = (
  assetIds: string[],
  options: ResolveAssetsOptions = {},
) => {
  const uniqueIds = [...new Set(assetIds.filter(Boolean))];
  if (uniqueIds.length === 0) return Promise.resolve([]);
  return callNative(() =>
    nativeImagePicker.resolveAssetsAsync(
      uniqueIds,
      normalizeResolveOptions(options),
    ),
  );
};

export const launchImageLibraryAsync = async (
  options: ImagePickerOptions = {},
) =>
  normalizeResult(
    await callNative(() =>
      nativeImagePicker.launchImageLibraryAsync(
        normalizeImagePickerOptions(options),
      ),
    ),
  );

export const launchCameraAsync = async (options: CameraOptions = {}) =>
  normalizeResult(
    await callNative(() =>
      nativeImagePicker.launchCameraAsync(normalizeCameraOptions(options)),
    ),
  );

export const getPendingResultAsync = async () => {
  const result = await callNative(() =>
    nativeImagePicker.getPendingResultAsync(),
  );
  if (!result) return null;
  if ('code' in result) return result as ImagePickerErrorResult;
  return normalizeResult(result);
};

export const clearCacheAsync = () =>
  callNative(() => nativeImagePicker.clearCacheAsync());

const libraryChangeListeners = new Set<
  (event: MediaLibraryChangeEvent) => void
>();

export function addMediaLibraryChangeListener(
  listener: (event: MediaLibraryChangeEvent) => void,
): { remove: () => void } {
  if (libraryChangeListeners.size === 0) {
    try {
      nativeImagePicker.setOnLibraryChange((event) => {
        libraryChangeListeners.forEach((currentListener) =>
          currentListener(event),
        );
      });
    } catch (error) {
      throw normalizeError(error);
    }
  }
  libraryChangeListeners.add(listener);
  let active = true;
  return {
    remove: () => {
      if (!active) return;
      active = false;
      libraryChangeListeners.delete(listener);
      if (libraryChangeListeners.size === 0) {
        try {
          nativeImagePicker.clearOnLibraryChange();
        } catch (error) {
          throw normalizeError(error);
        }
      }
    },
  };
}
