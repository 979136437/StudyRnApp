import {
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-media-library';
import * as MediaLibrary from 'expo-media-library/legacy';

import { unavailable } from '../core/error';
import { mapPermission } from '../core/mapping';
import type { MediaType } from '../core/types';
import { isWeb } from './platform';

const granular = (types: MediaType[]) =>
  types.map((type) => (type === 'image' ? 'photo' : 'video')) as (
    | 'photo'
    | 'video'
  )[];

export const libraryAdapter = {
  async getPermission(writeOnly: boolean, types: MediaType[]) {
    if (isWeb()) throw unavailable('相册权限');
    return mapPermission(await getPermissionsAsync(writeOnly, granular(types)));
  },
  async requestPermission(writeOnly: boolean, types: MediaType[]) {
    if (isWeb()) throw unavailable('相册权限');
    return mapPermission(
      await requestPermissionsAsync(writeOnly, granular(types)),
    );
  },
  async listAlbums() {
    if (isWeb()) throw unavailable('相册访问');
    return MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
  },
  async listAssets(options: {
    albumId: string | null;
    mediaTypes: MediaType[];
    offset: number;
    limit: number;
  }) {
    if (isWeb()) throw unavailable('相册访问');
    let after: string | undefined;
    let consumed = 0;
    while (consumed < options.offset) {
      const pageSize = Math.min(100, options.offset - consumed);
      const page = await MediaLibrary.getAssetsAsync({
        first: pageSize,
        after,
        album: options.albumId ?? undefined,
        mediaType: granular(options.mediaTypes),
        sortBy: [['creationTime', false]],
      });
      if (!page.assets.length || !page.hasNextPage)
        return { assets: [], hasNextPage: false };
      consumed += page.assets.length;
      after = page.endCursor;
    }
    const page = await MediaLibrary.getAssetsAsync({
      first: options.limit,
      after,
      album: options.albumId ?? undefined,
      mediaType: granular(options.mediaTypes),
      sortBy: [['creationTime', false]],
    });
    return { assets: page.assets, hasNextPage: page.hasNextPage };
  },
  async getAsset(id: string) {
    if (isWeb()) throw unavailable('相册访问');
    return MediaLibrary.getAssetInfoAsync(id, {
      shouldDownloadFromNetwork: true,
    });
  },
  async save(uri: string) {
    if (isWeb()) throw unavailable('保存到相册');
    await MediaLibrary.saveToLibraryAsync(uri);
  },
};

export type NativeAsset = Awaited<ReturnType<typeof libraryAdapter.getAsset>>;
