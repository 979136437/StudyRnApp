import type { ReactNode } from 'react';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

import type {
  AccessPrivileges,
  CameraType,
  ImagePickerAsset,
  MediaAlbum,
  MediaAsset,
  MediaAssetPage,
  MediaLibraryChangeEvent,
  MediaPermissionResponse,
  MediaTypeOption,
  PermissionStatus,
  ThumbnailResizeMode,
} from './specs/ImagePicker.nitro';

export type {
  AccessPrivileges,
  CameraType,
  ImagePickerAsset,
  MediaAlbum,
  MediaAsset,
  MediaAssetPage,
  MediaLibraryChangeEvent,
  MediaPermissionResponse,
  MediaTypeOption,
  PermissionStatus,
  ThumbnailResizeMode,
};

export type ImagePickerResult =
  | { canceled: true; assets: null }
  | { canceled: false; assets: ImagePickerAsset[] };

export interface ImagePickerOptions {
  mediaTypes?: MediaTypeOption[];
  allowsMultipleSelection?: boolean;
  selectionLimit?: number;
  orderedSelection?: boolean;
  shouldDownloadFromNetwork?: boolean;
}

export interface CameraOptions {
  mediaType?: 'image' | 'video';
  cameraType?: CameraType;
  videoMaxDuration?: number;
}

export interface AssetQueryOptions {
  albumId?: string;
  mediaTypes?: MediaTypeOption[];
  first?: number;
  after?: string;
}

export interface AlbumQueryOptions {
  mediaTypes?: MediaTypeOption[];
  includeSmartAlbums?: boolean;
}

export interface ResolveAssetsOptions {
  shouldDownloadFromNetwork?: boolean;
}

export interface MediaThumbnailProps {
  assetId: string;
  resizeMode?: ThumbnailResizeMode;
  shouldDownloadFromNetwork?: boolean;
  style?: StyleProp<ViewStyle>;
  onLoad?: (event: { assetId: string; width: number; height: number }) => void;
  onError?: (event: { assetId: string; message: string }) => void;
}

export interface MediaPickerTheme {
  background: ColorValue;
  surface: ColorValue;
  text: ColorValue;
  secondaryText: ColorValue;
  accent: ColorValue;
  separator: ColorValue;
  overlay: ColorValue;
  danger: ColorValue;
}

export interface MediaPickerLabels {
  title: string;
  cancel: string;
  done: string;
  albums: string;
  allMedia: string;
  grantAccessTitle: string;
  grantAccessDescription: string;
  grantAccess: string;
  manageAccess: string;
  openSettings: string;
  empty: string;
  retry: string;
  takePhoto: string;
  recordVideo: string;
  preview: string;
  closePreview: string;
  selectionLimitReached: string;
  unavailable: string;
  select?: string;
  selected?: string;
  video?: string;
  dismissMessage?: string;
}

export interface MediaPickerRenderContext {
  selectedCount: number;
  selectionLimit: number;
  busy: boolean;
}

export interface MediaPickerAssetRenderContext extends MediaPickerRenderContext {
  asset: MediaAsset;
  selectedIndex: number;
  toggleSelection: () => void;
  openPreview: () => void;
}

export interface MediaPickerViewProps {
  mediaTypes?: MediaTypeOption[];
  selectionLimit?: number;
  columns?: number;
  allowCamera?: boolean;
  cameraType?: CameraType;
  shouldDownloadFromNetwork?: boolean;
  initialSelectedAssetIds?: string[];
  theme?: Partial<MediaPickerTheme>;
  labels?: Partial<MediaPickerLabels>;
  style?: StyleProp<ViewStyle>;
  renderHeader?: (context: MediaPickerRenderContext) => ReactNode;
  renderAssetOverlay?: (context: MediaPickerAssetRenderContext) => ReactNode;
  renderEmpty?: () => ReactNode;
  renderPermissionDenied?: (permission: MediaPermissionResponse) => ReactNode;
  onCancel?: () => void;
  onComplete: (result: ImagePickerResult) => void;
  onError?: (error: NitroImagePickerError) => void;
}

export interface MediaPickerModalProps extends MediaPickerViewProps {
  visible: boolean;
  animationType?: 'none' | 'slide' | 'fade';
  onRequestClose?: () => void;
}

export type NitroImagePickerErrorCode =
  | 'E_UNAVAILABLE'
  | 'E_PERMISSION_DENIED'
  | 'E_PICKER_BUSY'
  | 'E_INVALID_OPTIONS'
  | 'E_INVALID_CURSOR'
  | 'E_ASSET_NOT_FOUND'
  | 'E_EXPORT_FAILED'
  | 'E_CAMERA_UNAVAILABLE'
  | 'E_UNKNOWN';

export class NitroImagePickerError extends Error {
  readonly code: NitroImagePickerErrorCode;

  constructor(
    code: NitroImagePickerErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'NitroImagePickerError';
    this.code = code;
  }
}
