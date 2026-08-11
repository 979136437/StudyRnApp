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
  shouldDownloadFromNetwork: boolean;
  onChoose: (album?: MediaAlbum) => void;
}

export function AlbumPickerRow({
  album,
  allMediaCountLabel,
  coverAssetId,
  labels,
  onChoose,
  selected,
  shouldDownloadFromNetwork,
  theme,
}: AlbumPickerRowProps): React.JSX.Element {
  const title = album?.title ?? labels.allMedia;
  const count = album?.assetCount ?? allMediaCountLabel;
  const accessibilityTitle = `${title}(${count})`;
  const choose = useCallback(() => {
    onChoose(album ?? undefined);
  }, [album, onChoose]);

  return (
    <View style={[styles.rowFrame, { borderBottomColor: theme.separator }]}>
      <View style={styles.row}>
        <View style={[styles.cover, { backgroundColor: theme.surface }]}>
          {coverAssetId ? (
            <MediaThumbnail
              assetId={coverAssetId}
              shouldDownloadFromNetwork={shouldDownloadFromNetwork}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
        </View>
        <View style={styles.copy}>
          <Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>
            {title}
          </Text>
          <Text style={[styles.count, { color: theme.secondaryText }]}>
            ({count})
          </Text>
        </View>
        {selected ? (
          <View style={styles.selectedBadge}>
            <Text style={[styles.selectedText, { color: theme.accent }]}>✓</Text>
          </View>
        ) : null}
      </View>
      <Pressable
        accessibilityLabel={`${accessibilityTitle}${selected ? '，当前相册' : ''}`}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={choose}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // 固定外层高度，避免回收中的原生缩略图参与 FlashList 行高推断。
  rowFrame: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    height: 82,
    width: '100%',
  },
  row: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
  },
  cover: { height: 82, overflow: 'hidden', width: 82 },
  copy: {
    alignItems: 'baseline',
    flex: 1,
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 24,
  },
  name: { flexShrink: 1, fontSize: 18, fontWeight: '500' },
  count: { fontSize: 18 },
  selectedBadge: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    marginRight: 20,
    width: 42,
  },
  selectedText: { fontSize: 28, fontWeight: '400' },
});
