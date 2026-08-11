import type { ReactNode } from 'react';

export type MediaFileType = 'image' | 'video';
export type MediaSourceType = 'album' | 'camera';
export type MediaSizeType = 'original' | 'compressed';
export type CameraPosition = 'front' | 'back';
export type VideoQuality = 'low' | 'medium' | 'high';

export interface MediaCallbacks<TResult> {
  success?: (result: TResult) => void;
  fail?: (error: MediaApiError) => void;
  complete?: (result: TResult | MediaApiError) => void;
}

export type MediaErrorCode =
  | 'INVALID_ARGUMENT'
  | 'PERMISSION_DENIED'
  | 'CANCELLED'
  | 'BUSY'
  | 'FILE_ERROR'
  | 'COMPRESS_ERROR'
  | 'UNAVAILABLE';

export class MediaApiError extends Error {
  readonly errMsg: string;

  constructor(
    readonly code: MediaErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'MediaApiError';
    this.errMsg = message;
  }
}

export interface ChooseMediaTempFile {
  tempFilePath: string;
  fileType: MediaFileType;
  size: number;
  width: number;
  height: number;
  duration?: number;
  thumbTempFilePath?: string;
}

export interface ChooseMediaResult {
  errMsg: 'chooseMedia:ok';
  tempFiles: ChooseMediaTempFile[];
}

export interface ChooseMediaOptions extends MediaCallbacks<ChooseMediaResult> {
  count?: number;
  mediaType?: MediaFileType[];
  sourceType?: MediaSourceType[];
  maxDuration?: number;
  sizeType?: MediaSizeType[];
  camera?: CameraPosition;
}

export interface PreviewMediaSource {
  url: string;
  type?: MediaFileType;
  poster?: string;
}

export interface PreviewMediaResult {
  errMsg: 'previewMedia:ok';
}

export interface PreviewMediaOptions extends MediaCallbacks<PreviewMediaResult> {
  sources: PreviewMediaSource[];
  current?: number;
  showmenu?: boolean;
}

export interface CompressImageResult {
  errMsg: 'compressImage:ok';
  tempFilePath: string;
}

export interface CompressImageOptions extends MediaCallbacks<CompressImageResult> {
  src: string;
  quality?: number;
  compressedWidth?: number;
  compressedHeight?: number;
}

export interface CompressVideoResult {
  errMsg: 'compressVideo:ok';
  tempFilePath: string;
  size: number;
}

export interface CompressVideoOptions extends MediaCallbacks<CompressVideoResult> {
  src: string;
  quality?: VideoQuality;
  bitrate?: number;
  /** 输出帧率上限；不会超过源帧率，并会向下适配设备支持的帧率。 */
  fps?: number;
  resolution?: number;
}

export interface MediaLibraryItem {
  id: string;
  type: MediaFileType;
  width: number;
  height: number;
  duration: number;
}

export interface ChooseMediaPageProps {
  options: Required<
    Pick<
      ChooseMediaOptions,
      | 'count'
      | 'mediaType'
      | 'sourceType'
      | 'maxDuration'
      | 'sizeType'
      | 'camera'
    >
  >;
  onCancel: () => void;
  onConfirm: (files: ChooseMediaTempFile[]) => void;
  onPreview: (sources: PreviewMediaSource[], current: number) => void;
  renderCamera?: (
    onCaptured: (file: ChooseMediaTempFile) => void,
    onClose: () => void,
  ) => ReactNode;
}

export interface PreviewMediaPageProps {
  sources: PreviewMediaSource[];
  current?: number;
  showmenu?: boolean;
  onClose: () => void;
  onBack?: () => void;
}
