import * as FileSystem from 'expo-file-system/legacy';

import { MediaKitError } from '../core/error';

const DIRECTORY = 'react-native-media-kit';

export interface DownloadHandle {
  result: Promise<string>;
  cancel(): Promise<void>;
}

export const normalizeLocalUri = (uri: string) =>
  uri.replace(/^file:(?!\/\/)/, 'file://');

export const extensionFromUri = (uri: string, fallback: string) => {
  const extension = uri.split(/[?#]/, 1)[0]?.match(/\.([a-z0-9]+)$/i)?.[1];
  return extension ? `.${extension.toLowerCase()}` : fallback;
};

const ensureCacheDirectory = async () => {
  if (!FileSystem.cacheDirectory)
    throw new MediaKitError('UNAVAILABLE', '缓存目录在当前平台不可用');
  const uri = `${FileSystem.cacheDirectory}${DIRECTORY}/`;
  await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
  return uri;
};

export const createCacheUri = async (extension: string) =>
  `${await ensureCacheDirectory()}${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`;

export const copyToCache = async (source: string, extension: string) => {
  const destination = await createCacheUri(extension);
  await FileSystem.copyAsync({ from: source, to: destination });
  return destination;
};

export const downloadToCache = async (
  source: string,
  extension: string,
): Promise<DownloadHandle> => {
  const destination = await createCacheUri(extension);
  const download = FileSystem.createDownloadResumable(source, destination);
  const cleanup = () =>
    FileSystem.deleteAsync(destination, { idempotent: true });
  return {
    result: download
      .downloadAsync()
      .then(async (response) => {
        if (response && response.status >= 200 && response.status < 300)
          return response.uri;
        await cleanup();
        throw new MediaKitError('DOWNLOAD_ERROR', '远程媒体下载失败');
      })
      .catch(async (error) => {
        await cleanup();
        throw error;
      }),
    cancel: async () => {
      await download.cancelAsync();
      await cleanup();
    },
  };
};

export const getFileSize = async (uri: string) => {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.isDirectory)
    throw new MediaKitError('FILE_ERROR', '媒体文件不存在');
  return info.size ?? 0;
};

export const deleteFile = async (uri: string) => {
  await FileSystem.deleteAsync(uri, { idempotent: true });
};
