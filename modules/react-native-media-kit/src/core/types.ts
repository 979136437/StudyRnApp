export type MediaType = 'image' | 'video';
export type VideoQuality = 'low' | 'medium' | 'high';

export interface MediaAsset {
  id: string;
  type: MediaType;
  width: number;
  height: number;
  duration: number;
  creationTime: number;
  uri: string;
}

export interface MediaFile {
  uri: string;
  type: MediaType;
  size: number;
  width: number;
  height: number;
  duration: number;
  fps: number;
  bitrate: number;
  thumbnailUri?: string;
  temporary: boolean;
}

export interface MediaTask<T> {
  readonly id: string;
  readonly result: Promise<T>;
  cancel(): boolean;
}

export type MediaKitErrorCode =
  | 'INVALID_ARGUMENT'
  | 'PERMISSION_DENIED'
  | 'CANCELLED'
  | 'FILE_ERROR'
  | 'DOWNLOAD_ERROR'
  | 'COMPRESS_ERROR'
  | 'SHARE_ERROR'
  | 'UNAVAILABLE';

export interface MediaPermission {
  status: 'granted' | 'denied' | 'undetermined';
  granted: boolean;
  canAskAgain: boolean;
  access: 'all' | 'limited' | 'none';
}

export interface MediaAlbum {
  id: string | null;
  title: string;
  assetCount: number;
  isRecent: boolean;
}

export interface MediaPage {
  items: MediaAsset[];
  nextOffset: number | null;
  hasMore: boolean;
}

export interface MediaSource {
  uri: string;
  type?: MediaType;
}

export interface MediaLibraryPermissionOptions {
  writeOnly?: boolean;
  mediaTypes?: MediaType[];
}

export interface ListMediaAssetsOptions {
  albumId?: string | null;
  mediaTypes?: MediaType[];
  offset?: number;
  limit?: number;
}

export interface ImageOptions {
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export interface VideoOptions {
  quality?: VideoQuality;
  bitrate?: number;
  fps?: number;
  resolution?: number;
  maxDimension?: number;
}

export interface PrepareMediaOptions {
  compress?: boolean;
  image?: ImageOptions;
  video?: VideoOptions;
  createThumbnail?: boolean;
}

export interface ThumbnailOptions {
  time?: number;
  quality?: number;
  maxWidth?: number;
}

export interface MediaMetadata {
  size: number;
  width: number;
  height: number;
  duration: number;
  fps: number;
  bitrate: number;
}
