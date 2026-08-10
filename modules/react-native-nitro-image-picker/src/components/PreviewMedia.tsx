import { Image, StyleSheet, Text, View } from 'react-native';

import type { PreviewMediaItem } from '../core/preview';
import { MediaThumbnail } from './MediaThumbnail';

interface PreviewMediaProps {
  item: PreviewMediaItem;
  shouldDownloadFromNetwork: boolean;
  videoLabel: string;
}

function formatDuration(duration?: number): string {
  if (!duration || duration <= 0) return '';
  const totalSeconds = Math.round(duration / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function PreviewMedia({
  item,
  shouldDownloadFromNetwork,
  videoLabel,
}: PreviewMediaProps): React.JSX.Element {
  const media = item.assetId ? (
    <MediaThumbnail
      assetId={item.assetId}
      resizeMode="contain"
      shouldDownloadFromNetwork={shouldDownloadFromNetwork}
      style={styles.media}
    />
  ) : item.type === 'image' && item.uri ? (
    <Image resizeMode="contain" source={{ uri: item.uri }} style={styles.media} />
  ) : (
    <View style={styles.videoPlaceholder}>
      <View style={styles.videoIcon}>
        <View style={styles.videoIconLens} />
      </View>
      <Text style={styles.videoLabel}>{videoLabel}</Text>
    </View>
  );

  return (
    <View style={styles.root}>
      {media}
      {item.type === 'video' && item.duration ? (
        <Text style={styles.duration}>{formatDuration(item.duration)}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#000000', flex: 1, overflow: 'hidden' },
  media: { backgroundColor: '#000000', height: '100%', width: '100%' },
  videoPlaceholder: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
  },
  videoIcon: {
    borderColor: '#ffffff',
    borderRadius: 4,
    borderWidth: 2,
    height: 32,
    opacity: 0.9,
    width: 44,
  },
  videoIconLens: {
    borderBottomColor: 'transparent',
    borderBottomWidth: 7,
    borderLeftColor: '#ffffff',
    borderLeftWidth: 10,
    borderTopColor: 'transparent',
    borderTopWidth: 7,
    height: 0,
    position: 'absolute',
    right: -12,
    top: 7,
    width: 0,
  },
  videoLabel: { color: '#ffffff', fontSize: 15 },
  duration: {
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
    borderRadius: 3,
    bottom: 12,
    color: '#ffffff',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    paddingHorizontal: 6,
    paddingVertical: 3,
    position: 'absolute',
    right: 12,
  },
});
