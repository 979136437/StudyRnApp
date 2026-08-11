import {
  normalizeImageRequest,
  normalizeMetadataSource,
  normalizeThumbnailRequest,
  normalizeVideoRequest,
} from '../core/options';
import { createCompressionTask, normalizeCompressorError } from '../core/task';
import { nativeCompressor } from '../native/compressor';
import type {
  CompressionResult,
  ImageCompressionOptions,
  ThumbnailOptions,
  ThumbnailResult,
  VideoCompressionOptions,
} from '../specs/Compressor.nitro';
import type { CompressionTask } from '../types';

const createTask = <TResult>(
  run: (id: string) => Promise<TResult>,
): CompressionTask<TResult> => {
  return createCompressionTask(
    () => nativeCompressor.createOperationId(),
    (id) => nativeCompressor.cancel(id),
    run,
  );
};

export const compressImage = (
  source: string,
  options?: Partial<ImageCompressionOptions>,
): CompressionTask<CompressionResult> => {
  const request = normalizeImageRequest(source, options);
  return createTask((id) =>
    nativeCompressor.compressImage(id, request.source, request.options),
  );
};

export const compressVideo = (
  source: string,
  options?: Partial<VideoCompressionOptions>,
): CompressionTask<CompressionResult> => {
  const request = normalizeVideoRequest(source, options);
  return createTask((id) =>
    nativeCompressor.compressVideo(id, request.source, request.options),
  );
};

export const createVideoThumbnail = (
  source: string,
  options?: Partial<ThumbnailOptions>,
): CompressionTask<ThumbnailResult> => {
  const request = normalizeThumbnailRequest(source, options);
  return createTask((id) =>
    nativeCompressor.createVideoThumbnail(id, request.source, request.options),
  );
};

export const getImageMetadata = (source: string) =>
  nativeCompressor
    .getImageMetadata(normalizeMetadataSource(source))
    .catch((error) => Promise.reject(normalizeCompressorError(error)));

export const getVideoMetadata = (source: string) =>
  nativeCompressor
    .getVideoMetadata(normalizeMetadataSource(source))
    .catch((error) => Promise.reject(normalizeCompressorError(error)));

export const cancelCompression = (operationId: string) =>
  nativeCompressor.cancel(operationId);
