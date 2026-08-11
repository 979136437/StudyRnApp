import { FlashList } from '@shopify/flash-list';
import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import {
  Album,
  Asset,
  AssetField,
  MediaType,
  Query,
  requestPermissionsAsync,
  type AssetMetadata,
} from 'expo-media-library';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  cancelVideoCompression,
  executeCompressImage,
  executeCompressVideo,
  readMediaFile,
} from '../core/compression';
import { MEDIA_CACHE_DIRECTORY, MEDIA_LIMITS } from '../core/constants';
import {
  MediaApiError,
  type ChooseMediaPageProps,
  type ChooseMediaTempFile,
  type MediaLibraryItem,
} from '../types';
import { CameraCapture } from './CameraCapture';

interface AlbumEntry {
  album?: Album;
  title: string;
}

const toItem = (asset: AssetMetadata): MediaLibraryItem | null => {
  if (
    asset.mediaType !== MediaType.IMAGE &&
    asset.mediaType !== MediaType.VIDEO
  )
    return null;
  return {
    id: asset.id,
    type: asset.mediaType === MediaType.VIDEO ? 'video' : 'image',
    width: asset.width ?? 0,
    height: asset.height ?? 0,
    duration: (asset.duration ?? 0) / 1000,
  };
};

const stableCopy = async (uri: string, filename: string) => {
  const directory = new Directory(Paths.cache, MEDIA_CACHE_DIRECTORY);
  directory.create({ idempotent: true, intermediates: true });
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const target = new File(directory, `${Date.now()}-${safeName || 'media'}`);
  await new File(uri).copy(target, { overwrite: true });
  return target.uri;
};

const removeTemporaryFile = (uri: string) => {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // 清理失败不覆盖原始媒体错误，缓存目录仍受系统回收策略管理。
  }
};

const resolveItem = async (
  item: MediaLibraryItem,
  original: boolean,
  onVideoCancellationId: (id: string) => void,
): Promise<ChooseMediaTempFile> => {
  const info = await new Asset(item.id).getInfo();
  const stablePath = await stableCopy(info.uri, info.filename);
  let tempFilePath = stablePath;
  try {
    if (!original) {
      tempFilePath =
        item.type === 'image'
          ? await executeCompressImage(
              { src: stablePath },
              onVideoCancellationId,
            )
          : (
              await executeCompressVideo(
                { src: stablePath, quality: 'medium' },
                onVideoCancellationId,
              )
            ).tempFilePath;
      removeTemporaryFile(stablePath);
    }
    const metadata = await readMediaFile(
      tempFilePath,
      item.type,
      onVideoCancellationId,
    );
    return { tempFilePath, fileType: item.type, ...metadata };
  } catch (error) {
    removeTemporaryFile(stablePath);
    if (tempFilePath !== stablePath) removeTemporaryFile(tempFilePath);
    throw error;
  }
};

export function ChooseMediaPage({
  options,
  onCancel,
  onConfirm,
  onPreview,
}: ChooseMediaPageProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [albums, setAlbums] = useState<AlbumEntry[]>([{ title: '最近项目' }]);
  const [album, setAlbum] = useState<AlbumEntry>({ title: '最近项目' });
  const [albumOpen, setAlbumOpen] = useState(false);
  const [selected, setSelected] = useState<MediaLibraryItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [original, setOriginal] = useState(
    options.sizeType.length === 1 && options.sizeType[0] === 'original',
  );
  const [cameraOpen, setCameraOpen] = useState(
    options.sourceType.length === 1 && options.sourceType[0] === 'camera',
  );
  const [error, setError] = useState<string>();
  const activeRef = useRef(true);
  const videoCancellationIdsRef = useRef(new Set<string>());
  const tileSize = width / 4;

  useEffect(
    () => () => {
      activeRef.current = false;
      for (const id of videoCancellationIdsRef.current) {
        cancelVideoCompression(id);
      }
      videoCancellationIdsRef.current.clear();
    },
    [],
  );

  const registerVideoCancellation = (id: string) => {
    videoCancellationIdsRef.current.add(id);
  };

  const loadPage = useCallback(
    async (reset: boolean) => {
      if (
        loading ||
        (!reset && !hasMore) ||
        !options.sourceType.includes('album')
      )
        return;
      setLoading(true);
      try {
        const permission = await requestPermissionsAsync(
          false,
          options.mediaType.map((type) =>
            type === 'image' ? 'photo' : 'video',
          ),
        );
        if (!permission.granted)
          throw new MediaApiError('PERMISSION_DENIED', '没有相册读取权限');
        const nextOffset = reset ? 0 : offset;
        let query = new Query()
          .within(
            AssetField.MEDIA_TYPE,
            options.mediaType.map((type) =>
              type === 'image' ? MediaType.IMAGE : MediaType.VIDEO,
            ),
          )
          .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
          .offset(nextOffset)
          .limit(MEDIA_LIMITS.pageSize);
        if (album.album) query = query.album(album.album);
        const page = (await query.exeForMetadata())
          .map(toItem)
          .filter((value): value is MediaLibraryItem => value !== null);
        setItems((previous) => (reset ? page : [...previous, ...page]));
        setOffset(nextOffset + page.length);
        setHasMore(page.length === MEDIA_LIMITS.pageSize);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '读取相册失败');
      } finally {
        setLoading(false);
      }
    },
    [album, hasMore, loading, offset, options.mediaType, options.sourceType],
  );

  // 相册是重置分页的唯一触发源；依赖 loadPage 会被 offset 更新反复触发。
  /* oxlint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    void loadPage(true);
  }, [album]);
  /* oxlint-enable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!options.sourceType.includes('album')) return;
    Album.getAll()
      .then(async (values) => {
        const titles = await Promise.all(
          values.map(async (value) => ({
            album: value,
            title: await value.getTitle(),
          })),
        );
        setAlbums([{ title: '最近项目' }, ...titles]);
      })
      .catch(() => undefined);
  }, [options.sourceType]);

  const toggle = (item: MediaLibraryItem) => {
    setSelected((previous) => {
      const index = previous.findIndex((value) => value.id === item.id);
      if (index >= 0) return previous.filter((value) => value.id !== item.id);
      if (previous.length >= options.count) return previous;
      return [...previous, item];
    });
  };

  const preview = async (item: MediaLibraryItem) => {
    try {
      const list = selected.length ? selected : [item];
      const sources = await Promise.all(
        list.map(async (value) => ({
          url: await new Asset(value.id).getUri(),
          type: value.type,
        })),
      );
      onPreview(
        sources,
        Math.max(
          0,
          list.findIndex((value) => value.id === item.id),
        ),
      );
    } catch {
      setError('媒体预览准备失败');
    }
  };

  const confirm = async () => {
    if (!selected.length || submitting) return;
    setSubmitting(true);
    const files: ChooseMediaTempFile[] = [];
    try {
      for (const item of selected)
        files.push(
          await resolveItem(item, original, registerVideoCancellation),
        );
      if (!activeRef.current)
        throw new MediaApiError('CANCELLED', 'chooseMedia:fail cancel');
      onConfirm(files);
    } catch (reason) {
      for (const file of files) {
        removeTemporaryFile(file.tempFilePath);
        if (file.thumbTempFilePath) removeTemporaryFile(file.thumbTempFilePath);
      }
      if (activeRef.current) {
        setError(reason instanceof Error ? reason.message : '媒体处理失败');
        setSubmitting(false);
      }
    }
  };

  const confirmCameraFile = async (file: ChooseMediaTempFile) => {
    if (original) {
      onConfirm([file]);
      return;
    }
    setSubmitting(true);
    try {
      const tempFilePath =
        file.fileType === 'image'
          ? await executeCompressImage(
              { src: file.tempFilePath },
              registerVideoCancellation,
            )
          : (
              await executeCompressVideo(
                { src: file.tempFilePath, quality: 'medium' },
                registerVideoCancellation,
              )
            ).tempFilePath;
      const metadata = await readMediaFile(
        tempFilePath,
        file.fileType,
        registerVideoCancellation,
      );
      removeTemporaryFile(file.tempFilePath);
      if (!activeRef.current) {
        removeTemporaryFile(tempFilePath);
        if (metadata.thumbTempFilePath)
          removeTemporaryFile(metadata.thumbTempFilePath);
        return;
      }
      onConfirm([{ tempFilePath, fileType: file.fileType, ...metadata }]);
    } catch (reason) {
      if (activeRef.current) {
        setSubmitting(false);
        setError(reason instanceof Error ? reason.message : '拍摄媒体处理失败');
      }
    }
  };

  if (cameraOpen) {
    return (
      <CameraCapture
        camera={options.camera}
        mediaType={options.mediaType}
        maxDuration={options.maxDuration}
        onClose={() =>
          options.sourceType.includes('album')
            ? setCameraOpen(false)
            : onCancel()
        }
        onCaptured={(file) => void confirmCameraFile(file)}
      />
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable style={styles.iconButton} onPress={onCancel}>
          <Text style={styles.headerIcon}>×</Text>
        </Pressable>
        <Pressable
          style={styles.albumButton}
          onPress={() => setAlbumOpen((value) => !value)}
        >
          <Text style={styles.albumTitle}>
            {album.title} {albumOpen ? '⌃' : '⌄'}
          </Text>
        </Pressable>
        {options.sourceType.includes('camera') ? (
          <Pressable
            style={styles.iconButton}
            onPress={() => setCameraOpen(true)}
          >
            <Text style={styles.cameraText}>相机</Text>
          </Pressable>
        ) : (
          <View style={styles.iconButton} />
        )}
      </View>
      <FlashList
        data={items}
        numColumns={4}
        keyExtractor={(item) => item.id}
        onEndReached={() => void loadPage(false)}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.muted}>{error ?? '暂无媒体'}</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const selectedIndex = selected.findIndex(
            (value) => value.id === item.id,
          );
          return (
            <Pressable
              style={{ width: tileSize, height: tileSize }}
              onPress={() => void preview(item)}
            >
              <Image
                source={item.id}
                style={styles.thumbnail}
                contentFit="cover"
              />
              {item.type === 'video' ? (
                <Text style={styles.duration}>
                  {Math.ceil(item.duration)}秒
                </Text>
              ) : null}
              <Pressable
                hitSlop={8}
                style={[styles.select, selectedIndex >= 0 && styles.selected]}
                onPress={() => toggle(item)}
              >
                <Text style={styles.selectText}>
                  {selectedIndex >= 0 ? selectedIndex + 1 : ''}
                </Text>
              </Pressable>
            </Pressable>
          );
        }}
      />
      {loading ? (
        <ActivityIndicator style={styles.loading} color="#22c55e" />
      ) : null}
      <View
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}
      >
        <Pressable
          disabled={!selected.length}
          onPress={() => selected[0] && void preview(selected[0])}
        >
          <Text
            style={[styles.footerText, !selected.length && styles.disabledText]}
          >
            预览
          </Text>
        </Pressable>
        {options.sizeType.length > 1 ? (
          <Pressable
            style={styles.original}
            onPress={() => setOriginal((value) => !value)}
          >
            <View style={[styles.radio, original && styles.radioActive]} />
            <Text style={styles.footerText}>原图</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable
          style={[styles.confirm, !selected.length && styles.confirmDisabled]}
          disabled={!selected.length || submitting}
          onPress={() => void confirm()}
        >
          <Text style={styles.confirmText}>
            {submitting
              ? '处理中'
              : `完成${selected.length ? `(${selected.length})` : ''}`}
          </Text>
        </Pressable>
      </View>
      {albumOpen ? (
        <View style={[styles.albumPanel, { top: insets.top + 52 }]}>
          {albums.map((entry) => (
            <Pressable
              key={entry.album?.id ?? 'recent'}
              style={styles.albumRow}
              onPress={() => {
                setAlbum(entry);
                setAlbumOpen(false);
                setSelected([]);
                setOffset(0);
                setHasMore(true);
              }}
            >
              <Text style={styles.albumRowText}>{entry.title}</Text>
              {entry.album?.id === album.album?.id ||
              (!entry.album && !album.album) ? (
                <Text style={styles.check}>✓</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#151515' },
  header: {
    minHeight: 52,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#292929',
  },
  iconButton: {
    width: 52,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: { color: '#fff', fontSize: 32 },
  cameraText: { color: '#fff', fontSize: 14 },
  albumButton: {
    height: 36,
    paddingHorizontal: 16,
    justifyContent: 'center',
    backgroundColor: '#3a3a3a',
    borderRadius: 8,
  },
  albumTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  thumbnail: {
    width: '100%',
    height: '100%',
    borderWidth: 1,
    borderColor: '#151515',
  },
  select: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 27,
    height: 27,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { backgroundColor: '#16c268', borderColor: '#16c268' },
  selectText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  duration: {
    position: 'absolute',
    right: 5,
    bottom: 4,
    color: '#fff',
    fontSize: 11,
  },
  footer: {
    minHeight: 64,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#202020',
  },
  footerText: { color: '#fff', fontSize: 15 },
  disabledText: { color: '#666' },
  original: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#fff',
  },
  radioActive: { backgroundColor: '#16c268', borderColor: '#16c268' },
  confirm: {
    minHeight: 40,
    minWidth: 68,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16c268',
    borderRadius: 6,
  },
  confirmDisabled: { backgroundColor: '#343434' },
  confirmText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  albumPanel: {
    position: 'absolute',
    zIndex: 10,
    left: 0,
    right: 0,
    maxHeight: '72%',
    backgroundColor: '#303030',
  },
  albumRow: {
    minHeight: 64,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#4a4a4a',
  },
  albumRowText: { color: '#eee', fontSize: 17 },
  check: { color: '#19cc70', fontSize: 22 },
  loading: { position: 'absolute', top: '50%', alignSelf: 'center' },
  empty: { minHeight: 240, alignItems: 'center', justifyContent: 'center' },
  muted: { color: '#aaa' },
});
