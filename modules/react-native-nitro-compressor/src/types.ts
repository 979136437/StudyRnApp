export type {
  CompressionResult,
  ImageCompressionOptions,
  ImageMetadata,
  ThumbnailOptions,
  ThumbnailResult,
  VideoCompressionOptions,
  VideoMetadata,
} from './specs/Compressor.nitro';

export interface CompressionTask<TResult> {
  readonly id: string;
  readonly result: Promise<TResult>;
  cancel(): boolean;
}

export class CompressorError extends Error {
  constructor(
    readonly code:
      | 'INVALID_ARGUMENT'
      | 'UNAVAILABLE'
      | 'CANCELLED'
      | 'NATIVE_ERROR',
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CompressorError';
  }
}
