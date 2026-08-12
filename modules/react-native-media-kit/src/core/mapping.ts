import type { NativeAsset } from '../native/media-library';
import type {
  MediaAsset,
  MediaMetadata,
  MediaPermission,
  MediaType,
} from './types';

export const mapNativeType = (type: string): MediaType =>
  type === 'video' ? 'video' : 'image';

export const mapPermission = (permission: {
  status: 'granted' | 'denied' | 'undetermined';
  granted: boolean;
  canAskAgain: boolean;
  accessPrivileges?: 'all' | 'limited' | 'none';
}): MediaPermission => ({
  status: permission.status,
  granted: permission.granted,
  canAskAgain: permission.canAskAgain,
  access: permission.accessPrivileges ?? (permission.granted ? 'all' : 'none'),
});

export const mapAsset = (asset: NativeAsset): MediaAsset => ({
  id: asset.id,
  type: mapNativeType(asset.mediaType),
  width: asset.width,
  height: asset.height,
  duration: asset.duration,
  creationTime: asset.creationTime,
  uri: asset.localUri ?? asset.uri,
});

export const imageMetadata = (value: {
  size: number;
  width: number;
  height: number;
}): MediaMetadata => ({
  size: value.size,
  width: value.width,
  height: value.height,
  duration: 0,
  fps: 0,
  bitrate: 0,
});

export const videoMetadata = (value: MediaMetadata): MediaMetadata => ({
  ...value,
});
