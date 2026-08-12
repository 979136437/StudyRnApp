import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  compressImage,
  compressVideo,
  listAlbums,
  listMediaAssets,
  prepareMediaAsset,
  prepareMediaFile,
  removeTemporaryFiles,
  requestMediaLibraryPermission,
  saveToMediaLibrary,
  shareMedia,
  type MediaAlbum,
  type MediaAsset,
  type MediaFile,
  type MediaTask,
  type MediaType,
} from 'react-native-media-kit';

import { MediaCamera } from './media-camera';

const PAGE_SIZE = 24;
const formatBytes = (value: number) =>
  value >= 1024 * 1024
    ? `${(value / 1024 / 1024).toFixed(1)} MB`
    : `${Math.ceil(value / 1024)} kB`;

function AlbumItem({
  album,
  active,
  onPress,
}: {
  album: MediaAlbum;
  active: boolean;
  onPress: (id: string | null) => void;
}) {
  const handlePress = useCallback(() => onPress(album.id), [album.id, onPress]);
  return (
    <Pressable
      onPress={handlePress}
      style={[styles.album, active && styles.activeAlbum]}
    >
      <Text style={styles.albumText}>{album.title}</Text>
    </Pressable>
  );
}

function PreparedItem({
  file,
  onPress,
}: {
  file: MediaFile;
  onPress: (file: MediaFile) => void;
}) {
  const handlePress = useCallback(() => onPress(file), [file, onPress]);
  return (
    <Pressable onPress={handlePress} style={styles.file}>
      <Image
        source={file.thumbnailUri ?? file.uri}
        style={styles.fileImage}
        contentFit="cover"
      />
      <Text style={styles.fileText}>
        {file.type} · {formatBytes(file.size)}
      </Text>
    </Pressable>
  );
}

function AssetItem({
  asset,
  active,
  onToggle,
}: {
  asset: MediaAsset;
  active: boolean;
  onToggle: (id: string) => void;
}) {
  const handlePress = useCallback(
    () => onToggle(asset.id),
    [asset.id, onToggle],
  );
  return (
    <Pressable
      onPress={handlePress}
      style={[styles.asset, active && styles.activeAsset]}
    >
      <Image source={asset.uri} style={styles.thumbnail} contentFit="cover" />
      <Text style={styles.assetType}>
        {asset.type === 'video' ? `${asset.duration.toFixed(1)}s` : '图片'}
      </Text>
    </Pressable>
  );
}

function Preview({ file, onClose }: { file?: MediaFile; onClose: () => void }) {
  const player = useVideoPlayer(file?.type === 'video' ? file.uri : null);
  useEffect(() => {
    if (file?.type === 'video') player.play();
    return () => player.pause();
  }, [file, player]);
  return (
    <Modal
      visible={Boolean(file)}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.preview}>
        {file?.type === 'image' ? (
          <Image
            source={file.uri}
            style={styles.previewMedia}
            contentFit="contain"
          />
        ) : null}
        {file?.type === 'video' ? (
          <VideoView
            player={player}
            style={styles.previewMedia}
            nativeControls
          />
        ) : null}
        <Pressable onPress={onClose} style={styles.previewClose}>
          <Text style={styles.previewCloseText}>关闭</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

export function MediaTestScreen() {
  const [albums, setAlbums] = useState<MediaAlbum[]>([]);
  const [albumId, setAlbumId] = useState<string | null>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [preview, setPreview] = useState<MediaFile>();
  const [cameraType, setCameraType] = useState<MediaType>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('等待授权');
  const [activeTask, setActiveTask] = useState<MediaTask<unknown>>();

  const selectedIds = useMemo(() => new Set(selected), [selected]);
  const executeOperation = async (operation: Promise<void>) => {
    setBusy(true);
    try {
      await operation;
    } catch (reason) {
      setResult(reason instanceof Error ? reason.message : '操作失败');
    } finally {
      setBusy(false);
      setActiveTask(undefined);
    }
  };
  const runTask = async <T,>(task: MediaTask<T>) => {
    setActiveTask(task as MediaTask<unknown>);
    return task.result;
  };
  const loadAssets = async (reset = false) => {
    const offset = reset ? 0 : nextOffset;
    if (offset === null) return;
    const page = await listMediaAssets({ albumId, offset, limit: PAGE_SIZE });
    setAssets((current) => (reset ? page.items : [...current, ...page.items]));
    setNextOffset(page.nextOffset);
    setResult(
      `已加载 ${reset ? page.items.length : assets.length + page.items.length} 项`,
    );
  };
  const authorizeLibrary = async () => {
    const permission = await requestMediaLibraryPermission();
    if (!permission.granted) throw new Error('未获得相册权限');
    setAlbums(await listAlbums());
    setNextOffset(0);
    const page = await listMediaAssets({ limit: PAGE_SIZE });
    setAssets(page.items);
    setNextOffset(page.nextOffset);
    setResult('相册已就绪');
  };
  const chooseAlbum = useCallback(
    (id: string | null) => {
      if (busy) return;
      setAlbumId(id);
      setAssets([]);
      setSelected([]);
      setNextOffset(0);
      void executeOperation(
        (async () => {
          const page = await listMediaAssets({ albumId: id, limit: PAGE_SIZE });
          setAssets(page.items);
          setNextOffset(page.nextOffset);
        })(),
      );
    },
    [busy],
  );
  const prepareSelectedFiles = async () => {
    const prepared: MediaFile[] = [];
    try {
      // 串行推进可确保取消按钮始终对应当前任务，并简化部分失败回收。
      for (const id of selected)
        prepared.push(await runTask(prepareMediaAsset(id)));
      setFiles((current) => [...current, ...prepared]);
      setResult(`已准备 ${prepared.length} 个文件`);
    } catch (error) {
      await removeTemporaryFiles(prepared);
      throw error;
    }
  };
  const handleCapture = (uri: string, type: MediaType) => {
    setCameraType(undefined);
    if (busy) return;
    void executeOperation(
      (async () => {
        const file = await runTask(prepareMediaFile(uri, type));
        setFiles((current) => [...current, file]);
        setResult('拍摄文件已准备');
      })(),
    );
  };
  const compressFirstFile = async () => {
    const source = files[0];
    if (!source) throw new Error('请先准备媒体文件');
    const file = await runTask(
      source.type === 'image'
        ? compressImage(source.uri, { quality: 80 })
        : compressVideo(source.uri, { quality: 'medium' }),
    );
    setFiles((current) => [file, ...current]);
    setResult(`压缩完成：${formatBytes(file.size)}`);
  };
  const saveFirstFile = async () => {
    if (!files[0]) throw new Error('请先准备媒体文件');
    await runTask(saveToMediaLibrary(files[0]));
    setResult('已保存到相册');
  };
  const shareFirstFile = async () => {
    if (!files[0]) throw new Error('请先准备媒体文件');
    await runTask(shareMedia(files[0]));
    setResult('分享面板已关闭');
  };
  const clearFiles = async () => {
    await removeTemporaryFiles(files);
    setFiles([]);
    setPreview(undefined);
    setResult('临时文件已清理');
  };
  const start = (operation: () => Promise<void>) => {
    if (!busy) void executeOperation(operation());
  };
  const renderAlbum = useCallback(
    ({ item }: { item: MediaAlbum }) => (
      <AlbumItem
        album={item}
        active={albumId === item.id}
        onPress={chooseAlbum}
      />
    ),
    [albumId, chooseAlbum],
  );
  const showPreview = useCallback((file: MediaFile) => setPreview(file), []);
  const renderPrepared = useCallback(
    ({ item }: { item: MediaFile }) => (
      <PreparedItem file={item} onPress={showPreview} />
    ),
    [showPreview],
  );
  const toggleSelected = useCallback(
    (id: string) =>
      setSelected((current) =>
        current.includes(id)
          ? current.filter((value) => value !== id)
          : [...current, id],
      ),
    [],
  );
  const authorizePress = () => start(authorizeLibrary);
  const photoPress = () => setCameraType('image');
  const videoPress = () => setCameraType('video');
  const nextPagePress = () => start(() => loadAssets(false));
  const preparePress = () => start(prepareSelectedFiles);
  const cancelPress = () => {
    activeTask?.cancel();
  };
  const compressPress = () => start(compressFirstFile);
  const savePress = () => start(saveFirstFile);
  const sharePress = () => start(shareFirstFile);
  const clearPress = () => start(clearFiles);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Title>媒体能力诊断</Stack.Title>
      <View style={styles.toolbar}>
        <Pressable style={styles.primary} onPress={authorizePress}>
          <Text style={styles.primaryText}>授权并加载</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={photoPress}>
          <Text style={styles.buttonText}>拍照</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={videoPress}>
          <Text style={styles.buttonText}>录像</Text>
        </Pressable>
      </View>
      <FlatList
        horizontal
        data={albums}
        keyExtractor={(album) => album.id ?? 'recent'}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.albums}
        renderItem={renderAlbum}
      />
      <View style={styles.grid}>
        {assets.map((asset) => (
          <AssetItem
            key={asset.id}
            asset={asset}
            active={selectedIds.has(asset.id)}
            onToggle={toggleSelected}
          />
        ))}
      </View>
      <View style={styles.toolbar}>
        <Pressable
          style={styles.button}
          onPress={nextPagePress}
          disabled={nextOffset === null}
        >
          <Text style={styles.buttonText}>下一页</Text>
        </Pressable>
        <Pressable style={styles.primary} onPress={preparePress}>
          <Text style={styles.primaryText}>准备所选 ({selected.length})</Text>
        </Pressable>
        {activeTask ? (
          <Pressable style={styles.danger} onPress={cancelPress}>
            <Text style={styles.primaryText}>取消任务</Text>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        horizontal
        data={files}
        keyExtractor={(file) => file.uri}
        contentContainerStyle={styles.prepared}
        renderItem={renderPrepared}
      />
      <View style={styles.toolbar}>
        <Pressable style={styles.button} onPress={compressPress}>
          <Text style={styles.buttonText}>压缩首项</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={savePress}>
          <Text style={styles.buttonText}>保存</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={sharePress}>
          <Text style={styles.buttonText}>分享</Text>
        </Pressable>
        <Pressable style={styles.danger} onPress={clearPress}>
          <Text style={styles.primaryText}>清理</Text>
        </Pressable>
      </View>
      <View style={styles.result}>
        <Text style={styles.resultTitle}>{busy ? '处理中' : '结果'}</Text>
        <Text selectable style={styles.resultText}>
          {result}
        </Text>
      </View>
      <MediaCamera
        visible={Boolean(cameraType)}
        type={cameraType ?? 'image'}
        onCapture={handleCapture}
        onClose={() => setCameraType(undefined)}
      />
      <Preview file={preview} onClose={() => setPreview(undefined)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f4f5' },
  content: { padding: 16, paddingBottom: 48, gap: 14 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primary: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: '#166534',
  },
  primaryText: { color: '#fff', fontWeight: '600' },
  button: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#71717a',
    backgroundColor: '#fff',
  },
  buttonText: { color: '#27272a', fontWeight: '600' },
  danger: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: '#b91c1c',
  },
  albums: { gap: 8 },
  album: {
    paddingHorizontal: 12,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#e4e4e7',
  },
  activeAlbum: { backgroundColor: '#bbf7d0' },
  albumText: { color: '#27272a' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  asset: {
    width: '31.5%',
    aspectRatio: 1,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  activeAsset: { borderColor: '#15803d' },
  thumbnail: { width: '100%', height: '100%' },
  assetType: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 4,
    fontSize: 11,
  },
  prepared: { gap: 8 },
  file: { width: 132, gap: 5 },
  fileImage: { width: 132, height: 96, borderRadius: 6 },
  fileText: { color: '#3f3f46', fontSize: 12 },
  result: { padding: 14, borderRadius: 8, backgroundColor: '#18181b', gap: 6 },
  resultTitle: { color: '#fff', fontWeight: '700' },
  resultText: { color: '#e4e4e7' },
  preview: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  previewMedia: { width: '100%', height: '100%' },
  previewClose: { position: 'absolute', top: 48, right: 20, padding: 12 },
  previewCloseText: { color: '#fff', fontWeight: '700' },
});
