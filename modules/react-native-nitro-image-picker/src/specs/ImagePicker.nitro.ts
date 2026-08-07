import type {
  HybridObject,
  HybridView,
  HybridViewProps,
} from 'react-native-nitro-modules';

export type MediaType = 'image' | 'video';
export type MediaTypeOption = 'images' | 'videos';
export type PermissionStatus = 'undetermined' | 'denied' | 'granted';
export type AccessPrivileges = 'none' | 'limited' | 'all';
export type CameraType = 'front' | 'back';
export type ThumbnailResizeMode = 'cover' | 'contain';

export interface MediaPermissionResponse {
  status: PermissionStatus;
  granted: boolean;
  canAskAgain: boolean;
  accessPrivileges: AccessPrivileges;
}

export interface MediaAlbum {
  id: string;
  title: string;
  assetCount: number;
  coverAssetId?: string;
  isSmartAlbum: boolean;
}

export interface MediaAsset {
  assetId: string;
  type: MediaType;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  width: number;
  height: number;
  duration?: number;
  creationTime: number;
  modificationTime: number;
}

export interface MediaAssetPage {
  assets: MediaAsset[];
  endCursor?: string;
  hasNextPage: boolean;
  totalCount: number;
}

export interface ImagePickerAsset {
  assetId?: string;
  uri: string;
  type: MediaType;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  width: number;
  height: number;
  duration?: number;
}

export interface ImagePickerResult {
  canceled: boolean;
  assets?: ImagePickerAsset[];
}

export interface ImagePickerErrorResult {
  code: string;
  message: string;
}

export interface MediaTypeOptions {
  mediaTypes: MediaTypeOption[];
}

export interface AlbumQueryOptions extends MediaTypeOptions {
  includeSmartAlbums: boolean;
}

export interface AssetQueryOptions extends MediaTypeOptions {
  albumId?: string;
  first: number;
  after?: string;
}

export interface ResolveAssetsOptions {
  shouldDownloadFromNetwork: boolean;
}

export interface ImageLibraryOptions extends MediaTypeOptions {
  allowsMultipleSelection: boolean;
  selectionLimit: number;
  orderedSelection: boolean;
  shouldDownloadFromNetwork: boolean;
}

export interface CameraOptions {
  mediaType: MediaType;
  cameraType: CameraType;
  videoMaxDuration: number;
}

export interface MediaLibraryChangeEvent {
  hasIncrementalChanges: boolean;
  insertedAssetIds: string[];
  updatedAssetIds: string[];
  deletedAssetIds: string[];
}

export interface ThumbnailLoadEvent {
  assetId: string;
  width: number;
  height: number;
}

export interface ThumbnailErrorEvent {
  assetId: string;
  message: string;
}

export interface ImagePicker extends HybridObject<{
  ios: 'swift';
  android: 'kotlin';
}> {
  getMediaLibraryPermissionsAsync(
    options: MediaTypeOptions,
  ): Promise<MediaPermissionResponse>;
  requestMediaLibraryPermissionsAsync(
    options: MediaTypeOptions,
  ): Promise<MediaPermissionResponse>;
  getCameraPermissionsAsync(): Promise<MediaPermissionResponse>;
  requestCameraPermissionsAsync(): Promise<MediaPermissionResponse>;
  getMicrophonePermissionsAsync(): Promise<MediaPermissionResponse>;
  requestMicrophonePermissionsAsync(): Promise<MediaPermissionResponse>;
  presentLimitedLibraryPickerAsync(options: MediaTypeOptions): Promise<void>;
  getAlbumsAsync(options: AlbumQueryOptions): Promise<MediaAlbum[]>;
  getAssetsAsync(options: AssetQueryOptions): Promise<MediaAssetPage>;
  resolveAssetsAsync(
    assetIds: string[],
    options: ResolveAssetsOptions,
  ): Promise<ImagePickerAsset[]>;
  launchImageLibraryAsync(
    options: ImageLibraryOptions,
  ): Promise<ImagePickerResult>;
  launchCameraAsync(options: CameraOptions): Promise<ImagePickerResult>;
  getPendingResultAsync(): Promise<
    ImagePickerResult | ImagePickerErrorResult | undefined
  >;
  clearCacheAsync(): Promise<void>;
  setOnLibraryChange(callback: (event: MediaLibraryChangeEvent) => void): void;
  clearOnLibraryChange(): void;
}

export interface MediaThumbnailNativeProps extends HybridViewProps {
  assetId: string;
  resizeMode: ThumbnailResizeMode;
  shouldDownloadFromNetwork: boolean;
  onLoad: (event: ThumbnailLoadEvent) => void;
  onError: (event: ThumbnailErrorEvent) => void;
}

export type MediaThumbnail = HybridView<MediaThumbnailNativeProps>;
