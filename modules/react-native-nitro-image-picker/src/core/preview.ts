export type PreviewMode = 'album' | 'selected';

export interface PreviewMediaItem {
  id: string;
  type: 'image' | 'video';
  assetId?: string;
  uri?: string;
  fileName?: string;
  duration?: number;
}

interface LibraryPreviewSource {
  assetId: string;
  type: 'image' | 'video';
  fileName?: string;
  duration?: number;
}

interface CapturedPreviewSource {
  uri: string;
  type: 'image' | 'video';
  fileName?: string;
  duration?: number;
}

export function createAlbumPreviewItems(
  assets: LibraryPreviewSource[],
): PreviewMediaItem[] {
  return assets.map((asset) => ({
    id: asset.assetId,
    assetId: asset.assetId,
    type: asset.type,
    fileName: asset.fileName,
    duration: asset.duration,
  }));
}

export function createSelectedPreviewItems(
  assets: LibraryPreviewSource[],
  selectedIds: string[],
  capturedAssets: Record<string, CapturedPreviewSource>,
): PreviewMediaItem[] {
  const libraryById = new Map(assets.map((asset) => [asset.assetId, asset]));
  return selectedIds.flatMap<PreviewMediaItem>((id) => {
    const captured = capturedAssets[id];
    if (captured) {
      return [
        {
          id,
          uri: captured.uri,
          type: captured.type,
          fileName: captured.fileName,
          duration: captured.duration,
        } satisfies PreviewMediaItem,
      ];
    }
    const library = libraryById.get(id);
    return library
      ? [
          {
            id,
            assetId: library.assetId,
            type: library.type,
            fileName: library.fileName,
            duration: library.duration,
          } satisfies PreviewMediaItem,
        ]
      : [];
  });
}

export function findPreviewIndex(
  items: PreviewMediaItem[],
  assetId?: string,
): number {
  if (!items.length) return -1;
  const index = assetId ? items.findIndex((item) => item.id === assetId) : -1;
  return index >= 0 ? index : 0;
}

export function nextPreviewIdAfterRemoval(
  items: PreviewMediaItem[],
  removedId: string,
): string | undefined {
  const removedIndex = items.findIndex((item) => item.id === removedId);
  if (removedIndex < 0) return items[0]?.id;
  return items[removedIndex + 1]?.id ?? items[removedIndex - 1]?.id;
}
