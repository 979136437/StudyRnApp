import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MediaAlbum, MediaPickerLabels, MediaPickerTheme } from '../types';
import { MediaThumbnail } from './MediaThumbnail';

interface AlbumPickerRowProps {
  album: MediaAlbum | null;
  selected: boolean;
  labels: MediaPickerLabels;
  theme: MediaPickerTheme;
  coverAssetId?: string;
  allMediaCountLabel: string;
  onChoose: (album?: MediaAlbum) => void;
}

export function AlbumPickerRow({
  album,
  allMediaCountLabel,
  coverAssetId,
  labels,
  onChoose,
  selected,
  theme,
}: AlbumPickerRowProps): React.JSX.Element {
  const title = `${album?.title ?? labels.allMedia}(${album?.assetCount ?? allMediaCountLabel})`;
  const choose = useCallback(() => {
    onChoose(album ?? undefined);
  }, [album, onChoose]);

  return (
    <Pressable
      accessibilityLabel={`${title}${selected ? '，当前相册' : ''}`}
      accessibilityRole="button"
      onPress={choose}
      style={[styles.row, { borderBottomColor: theme.separator }]}
    >
      <View style={[styles.cover, { backgroundColor: theme.surface }]}>
        {coverAssetId ? (
          <MediaThumbnail
            assetId={coverAssetId}
            shouldDownloadFromNetwork
            style={StyleSheet.absoluteFill}
          />
        ) : null}
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>
          {title}
        </Text>
      </View>
      {selected ? (
        <View style={[styles.selectedBadge, { backgroundColor: theme.accent }]}>
          <Text style={styles.selectedText}>✓</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 16,
    minHeight: 96,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  cover: { height: 68, overflow: 'hidden', width: 68 },
  copy: { flex: 1 },
  name: { fontSize: 18, fontWeight: '500' },
  selectedBadge: {
    alignItems: 'center',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  selectedText: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
});
