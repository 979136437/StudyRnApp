import type { MediaFile } from './types';

const ownedUris = new Set<string>();

export const markTemporary = (uri: string) => {
  ownedUris.add(uri);
  return uri;
};

export const forgetTemporary = (uri: string) => ownedUris.delete(uri);

export const isOwnedUri = (uri: string | undefined): uri is string =>
  Boolean(uri && ownedUris.has(uri));

export const isOwnedTemporary = (file: Pick<MediaFile, 'uri' | 'temporary'>) =>
  file.temporary && ownedUris.has(file.uri);
