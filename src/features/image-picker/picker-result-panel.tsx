import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import type { ImagePickerResult } from 'react-native-nitro-image-picker';

import { imagePickerColors } from './colors';

interface PickerResultPanelProps {
  result?: ImagePickerResult;
}

function formatBytes(value?: number): string {
  if (value === undefined) return '未知大小';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function PickerResultPanel({
  result,
}: PickerResultPanelProps): React.JSX.Element {
  if (!result) {
    return (
      <Text selectable style={styles.empty}>
        尚无选择结果
      </Text>
    );
  }
  if (result.canceled) {
    return (
      <Text selectable style={styles.empty}>
        最近一次操作已取消，assets 为 null
      </Text>
    );
  }
  return (
    <View style={styles.list}>
      {result.assets.map((asset, index) => (
        <View key={`${asset.uri}:${index}`} style={styles.assetRow}>
          {asset.type === 'image' ? (
            <Image
              contentFit="cover"
              source={asset.uri}
              style={styles.thumbnail}
            />
          ) : (
            <View style={[styles.thumbnail, styles.videoThumbnail]}>
              <Text style={styles.videoLabel}>视频</Text>
            </View>
          )}
          <View style={styles.assetCopy}>
            <Text numberOfLines={1} selectable style={styles.assetName}>
              {asset.fileName ?? `资源 ${index + 1}`}
            </Text>
            <Text selectable style={styles.metadata}>
              {asset.width} × {asset.height} · {formatBytes(asset.fileSize)}
              {asset.duration
                ? ` · ${(asset.duration / 1000).toFixed(1)} 秒`
                : ''}
            </Text>
            <Text numberOfLines={2} selectable style={styles.uri}>
              {asset.uri}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  assetCopy: { flex: 1, gap: 4 },
  assetName: { color: imagePickerColors.text, fontSize: 14, fontWeight: '600' },
  assetRow: {
    alignItems: 'center',
    borderBottomColor: imagePickerColors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
  },
  empty: {
    color: imagePickerColors.muted,
    paddingVertical: 20,
    textAlign: 'center',
  },
  list: { gap: 0 },
  metadata: {
    color: imagePickerColors.muted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  thumbnail: {
    borderCurve: 'continuous',
    borderRadius: 5,
    height: 64,
    width: 64,
  },
  uri: { color: imagePickerColors.muted, fontSize: 11, lineHeight: 15 },
  videoLabel: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  videoThumbnail: {
    alignItems: 'center',
    backgroundColor: '#343438',
    justifyContent: 'center',
  },
});
