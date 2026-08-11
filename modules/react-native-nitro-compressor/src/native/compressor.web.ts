import type { Compressor } from '../specs/Compressor.nitro';
import { CompressorError } from '../types';

const unavailable = (): never => {
  throw new CompressorError('UNAVAILABLE', '当前平台不支持原生媒体压缩');
};

export const nativeCompressor: Compressor = {
  name: 'Compressor',
  createOperationId: unavailable,
  compressImage: async () => unavailable(),
  compressVideo: async () => unavailable(),
  getImageMetadata: async () => unavailable(),
  getVideoMetadata: async () => unavailable(),
  createVideoThumbnail: async () => unavailable(),
  cancel: () => false,
  equals: () => false,
  dispose: () => undefined,
};
