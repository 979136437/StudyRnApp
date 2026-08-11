import type { HybridObject } from 'react-native-nitro-modules';

export type ImageCompressionOptions = {
  quality: number;
  maxWidth?: number;
  maxHeight?: number;
};

export type VideoCompressionOptions = {
  maxDimension: number;
  bitrate?: number;
  fps?: number;
};

export type ThumbnailOptions = {
  time: number;
  quality: number;
  maxWidth?: number;
};

export type CompressionResult = {
  path: string;
  size: number;
  width: number;
  height: number;
  duration: number;
  fps: number;
  bitrate: number;
};

export type ImageMetadata = {
  size: number;
  width: number;
  height: number;
};

export type VideoMetadata = {
  size: number;
  width: number;
  height: number;
  duration: number;
  fps: number;
  bitrate: number;
};

export type ThumbnailResult = {
  path: string;
  size: number;
  width: number;
  height: number;
};

export interface Compressor extends HybridObject<{
  ios: 'swift';
  android: 'kotlin';
}> {
  createOperationId(): string;
  compressImage(
    operationId: string,
    source: string,
    options: ImageCompressionOptions,
  ): Promise<CompressionResult>;
  compressVideo(
    operationId: string,
    source: string,
    options: VideoCompressionOptions,
  ): Promise<CompressionResult>;
  getImageMetadata(source: string): Promise<ImageMetadata>;
  getVideoMetadata(source: string): Promise<VideoMetadata>;
  createVideoThumbnail(
    operationId: string,
    source: string,
    options: ThumbnailOptions,
  ): Promise<ThumbnailResult>;
  cancel(operationId: string): boolean;
}
