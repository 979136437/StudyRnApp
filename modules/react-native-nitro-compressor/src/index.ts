export {
  cancelCompression,
  compressImage,
  compressVideo,
  createVideoThumbnail,
  getImageMetadata,
  getVideoMetadata,
} from './api/compressor';
export { CompressorError } from './types';
export type { CompressionTask } from './types';
export type {
  CompressionResult,
  ImageCompressionOptions,
  ImageMetadata,
  ThumbnailOptions,
  ThumbnailResult,
  VideoCompressionOptions,
  VideoMetadata,
} from './specs/Compressor.nitro';
