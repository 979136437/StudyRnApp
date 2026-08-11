import { File } from 'expo-file-system';
import { Stack } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  chooseMedia,
  compressImage,
  compressVideo,
  previewMedia,
  type CameraPosition,
  type ChooseMediaTempFile,
  type MediaFileType,
  type MediaSourceType,
  type VideoQuality,
} from 'react-native-components';
import {
  getImageMetadata,
  getVideoMetadata,
} from 'react-native-nitro-compressor';

const MEDIA_TYPES: MediaFileType[] = ['image', 'video'];
const SOURCE_TYPES: MediaSourceType[] = ['album', 'camera'];
const VIDEO_QUALITIES: VideoQuality[] = ['low', 'medium', 'high'];
const parseOptionalNumber = (value: string) =>
  value.trim() ? Number(value) : undefined;
const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
    : `${Math.ceil(bytes / 1024)} kB`;
const summarize = (file: ChooseMediaTempFile) =>
  `${file.fileType === 'image' ? '图片' : '视频'} · ${file.width}×${file.height} · ${formatBytes(file.size)}${file.duration ? ` · ${file.duration.toFixed(1)} 秒` : ''}`;

function Segments<T extends string>({
  values,
  active,
  onPress,
}: {
  values: T[];
  active: T[];
  onPress: (value: T) => void;
}) {
  return (
    <View style={styles.segments}>
      {values.map((value) => (
        <Pressable
          key={value}
          style={[
            styles.segment,
            active.includes(value) && styles.segmentActive,
          ]}
          onPress={() => onPress(value)}
        >
          <Text
            style={[
              styles.segmentText,
              active.includes(value) && styles.segmentTextActive,
            ]}
          >
            {value}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder="默认"
      />
    </View>
  );
}

export function MediaTestScreen() {
  const [count, setCount] = useState('9');
  const [mediaType, setMediaType] = useState<MediaFileType[]>([
    'image',
    'video',
  ]);
  const [sourceType, setSourceType] = useState<MediaSourceType[]>([
    'album',
    'camera',
  ]);
  const [original, setOriginal] = useState(false);
  const [duration, setDuration] = useState('10');
  const [camera, setCamera] = useState<CameraPosition>('back');
  const [imageQuality, setImageQuality] = useState('80');
  const [imageWidth, setImageWidth] = useState('');
  const [imageHeight, setImageHeight] = useState('');
  const [videoQuality, setVideoQuality] = useState<VideoQuality>('medium');
  const [bitrate, setBitrate] = useState('');
  const [fps, setFps] = useState('');
  const [resolution, setResolution] = useState('');
  const [files, setFiles] = useState<ChooseMediaTempFile[]>([]);
  const [result, setResult] = useState('等待操作');
  const [busy, setBusy] = useState(false);

  const toggle = <T,>(setter: (value: T[]) => void, current: T[], value: T) => {
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    if (next.length) setter(next);
  };
  const run = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await operation();
    } catch (reason) {
      setResult(reason instanceof Error ? reason.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };
  const choose = () =>
    run(async () => {
      const response = await chooseMedia({
        count: Number(count),
        mediaType,
        sourceType,
        maxDuration: Number(duration),
        sizeType: original ? ['original'] : ['compressed'],
        camera,
      });
      setFiles(response.tempFiles);
      setResult(response.tempFiles.map(summarize).join('\n'));
    });
  const preview = () =>
    run(async () => {
      if (!files.length) throw new Error('请先选择媒体');
      await previewMedia({
        sources: files.map((file) => ({
          url: file.tempFilePath,
          type: file.fileType,
          poster: file.thumbTempFilePath,
        })),
      });
      setResult('预览已关闭');
    });
  const testImageCompression = () =>
    run(async () => {
      const selected = await chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType,
        sizeType: ['original'],
        camera,
      });
      const source = selected.tempFiles[0];
      if (!source) throw new Error('未选择图片');
      const compressed = await compressImage({
        src: source.tempFilePath,
        quality: Number(imageQuality),
        compressedWidth: parseOptionalNumber(imageWidth),
        compressedHeight: parseOptionalNumber(imageHeight),
      });
      const compressedSize = new File(compressed.tempFilePath).size ?? 0;
      const metadata = await getImageMetadata(compressed.tempFilePath);
      setFiles([
        {
          ...source,
          tempFilePath: compressed.tempFilePath,
          size: compressedSize,
          width: metadata.width,
          height: metadata.height,
        },
      ]);
      setResult(
        `图片压缩：${formatBytes(source.size)} / ${source.width}×${source.height} → ${formatBytes(compressedSize)} / ${metadata.width}×${metadata.height}`,
      );
    });
  const testVideoCompression = () =>
    run(async () => {
      const selected = await chooseMedia({
        count: 1,
        mediaType: ['video'],
        sourceType,
        sizeType: ['original'],
        camera,
        maxDuration: Number(duration),
      });
      const source = selected.tempFiles[0];
      if (!source) throw new Error('未选择视频');
      const hasPrecise = Boolean(bitrate.trim() || resolution.trim());
      const compressed = await compressVideo({
        src: source.tempFilePath,
        quality: hasPrecise ? undefined : videoQuality,
        bitrate: parseOptionalNumber(bitrate),
        fps: parseOptionalNumber(fps),
        resolution: parseOptionalNumber(resolution),
      });
      const metadata = await getVideoMetadata(compressed.tempFilePath);
      setFiles([
        {
          ...source,
          tempFilePath: compressed.tempFilePath,
          size: compressed.size * 1024,
          width: metadata.width,
          height: metadata.height,
          duration: metadata.duration,
        },
      ]);
      setResult(
        `视频压缩：${formatBytes(source.size)} / ${source.width}×${source.height} / ${(source.duration ?? 0).toFixed(1)} 秒 → ${compressed.size} kB / ${metadata.width}×${metadata.height} / ${metadata.duration.toFixed(1)} 秒 / ${metadata.fps.toFixed(1)} fps`,
      );
    });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Title>媒体能力测试</Stack.Title>
      <View style={styles.section}>
        <Text style={styles.title}>选择与预览</Text>
        <Field label="数量（1–20）" value={count} onChangeText={setCount} />
        <Text style={styles.label}>媒体类型</Text>
        <Segments
          values={MEDIA_TYPES}
          active={mediaType}
          onPress={(value) => toggle(setMediaType, mediaType, value)}
        />
        <Text style={styles.label}>来源</Text>
        <Segments
          values={SOURCE_TYPES}
          active={sourceType}
          onPress={(value) => toggle(setSourceType, sourceType, value)}
        />
        <Field
          label="录像上限（3–60 秒）"
          value={duration}
          onChangeText={setDuration}
        />
        <View style={styles.row}>
          <Text style={styles.label}>原图</Text>
          <Switch value={original} onValueChange={setOriginal} />
        </View>
        <Text style={styles.label}>相机方向</Text>
        <Segments
          values={['back', 'front']}
          active={[camera]}
          onPress={setCamera}
        />
        <View style={styles.actions}>
          <Pressable style={styles.primary} onPress={choose}>
            <Text style={styles.primaryText}>选择媒体</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={preview}>
            <Text style={styles.secondaryText}>预览结果</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.section}>
        <Text style={styles.title}>图片压缩</Text>
        <Field
          label="质量（0–100）"
          value={imageQuality}
          onChangeText={setImageQuality}
        />
        <Field
          label="目标宽度"
          value={imageWidth}
          onChangeText={setImageWidth}
        />
        <Field
          label="目标高度"
          value={imageHeight}
          onChangeText={setImageHeight}
        />
        <Pressable style={styles.primary} onPress={testImageCompression}>
          <Text style={styles.primaryText}>选择图片并压缩</Text>
        </Pressable>
      </View>
      <View style={styles.section}>
        <Text style={styles.title}>视频压缩</Text>
        <Text style={styles.label}>质量档位</Text>
        <Segments
          values={VIDEO_QUALITIES}
          active={[videoQuality]}
          onPress={setVideoQuality}
        />
        <Field label="码率（kbps）" value={bitrate} onChangeText={setBitrate} />
        <Field label="输出帧率上限" value={fps} onChangeText={setFps} />
        <Field
          label="分辨率比例（0–1）"
          value={resolution}
          onChangeText={setResolution}
        />
        <Pressable style={styles.primary} onPress={testVideoCompression}>
          <Text style={styles.primaryText}>选择视频并压缩</Text>
        </Pressable>
      </View>
      <View style={styles.result}>
        <Text style={styles.resultTitle}>{busy ? '处理中' : '结果摘要'}</Text>
        <Text selectable style={styles.resultText}>
          {result}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  section: { backgroundColor: '#fff', borderRadius: 8, padding: 16, gap: 12 },
  title: { color: '#111827', fontSize: 17, fontWeight: '700' },
  label: { color: '#4b5563', fontSize: 13 },
  field: { gap: 6 },
  input: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 12,
    color: '#111827',
    backgroundColor: '#fff',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  segments: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  segment: {
    minHeight: 36,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
  },
  segmentActive: { borderColor: '#15803d', backgroundColor: '#ecfdf5' },
  segmentText: { color: '#4b5563' },
  segmentTextActive: { color: '#166534', fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10 },
  primary: {
    minHeight: 42,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#15803d',
    borderRadius: 6,
  },
  primaryText: { color: '#fff', fontWeight: '600' },
  secondary: {
    minHeight: 42,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#15803d',
    borderRadius: 6,
  },
  secondaryText: { color: '#166534', fontWeight: '600' },
  result: { backgroundColor: '#111827', borderRadius: 8, padding: 16, gap: 8 },
  resultTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  resultText: { color: '#e5e7eb', lineHeight: 21 },
});
