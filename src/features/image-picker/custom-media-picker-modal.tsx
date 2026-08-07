import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  MediaThumbnail,
  NitroImagePickerError,
  addMediaLibraryChangeListener,
  getAlbumsAsync,
  getAssetsAsync,
  getMediaLibraryPermissionsAsync,
  presentLimitedLibraryPickerAsync,
  requestMediaLibraryPermissionsAsync,
  resolveAssetsAsync,
  type ImagePickerResult,
  type MediaAlbum,
  type MediaAsset,
  type MediaPermissionResponse,
  type MediaTypeOption,
} from 'react-native-nitro-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';

const PAGE_SIZE = 45;
const SELECTION_LIMIT = 5;
const GRID_COLUMNS = 2;
const GRID_GAP = 10;
const GRID_SIDE_PADDING = 12;

type MediaFilter = 'all' | 'images' | 'videos';

interface CustomMediaPickerModalProps {
  visible: boolean;
  onCancel: () => void;
  onComplete: (result: ImagePickerResult) => void;
  onError: (message: string) => void;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof NitroImagePickerError)
    return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

function formatDuration(duration?: number): string {
  if (!duration || duration <= 0) return '';
  const seconds = Math.round(duration / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function mediaTypesForFilter(filter: MediaFilter): MediaTypeOption[] {
  return filter === 'all' ? ['images', 'videos'] : [filter];
}

export function CustomMediaPickerModal({
  onCancel,
  onComplete,
  onError,
  visible,
}: CustomMediaPickerModalProps): React.JSX.Element {
  const { width } = useWindowDimensions();
  const [permission, setPermission] = useState<MediaPermissionResponse>();
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [albums, setAlbums] = useState<MediaAlbum[]>([]);
  const [activeAlbumId, setActiveAlbumId] = useState<string>();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<MediaAsset[]>([]);
  const [endCursor, setEndCursor] = useState<string>();
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  const queryMediaTypes = useMemo(
    () => mediaTypesForFilter(mediaFilter),
    [mediaFilter],
  );

  const reportError = useCallback(
    (error: unknown) => {
      const nextMessage = getErrorMessage(error);
      setMessage(nextMessage);
      onError(nextMessage);
    },
    [onError],
  );

  const loadFirstPage = useCallback(
    async (
      albumId: string | undefined,
      selectedMediaTypes: MediaTypeOption[],
    ) => {
      setLoading(true);
      setMessage(undefined);
      try {
        const [nextAlbums, page] = await Promise.all([
          getAlbumsAsync({
            includeSmartAlbums: true,
            mediaTypes: selectedMediaTypes,
          }),
          getAssetsAsync({
            albumId,
            first: PAGE_SIZE,
            mediaTypes: selectedMediaTypes,
          }),
        ]);
        setAlbums(nextAlbums);
        setAssets(page.assets);
        setEndCursor(page.endCursor);
        setHasNextPage(page.hasNextPage);
      } catch (error) {
        reportError(error);
      } finally {
        setLoading(false);
      }
    },
    [reportError],
  );

  const initialize = useCallback(async () => {
    setLoading(true);
    setMessage(undefined);
    try {
      const nextPermission = await getMediaLibraryPermissionsAsync([
        'images',
        'videos',
      ]);
      setPermission(nextPermission);
      if (nextPermission.granted)
        await loadFirstPage(undefined, ['images', 'videos']);
    } catch (error) {
      reportError(error);
    } finally {
      setLoading(false);
    }
  }, [loadFirstPage, reportError]);

  useEffect(() => {
    if (!visible) return;
    setMediaFilter('all');
    setActiveAlbumId(undefined);
    setSelectedAssets([]);
    void initialize();
  }, [initialize, visible]);

  useEffect(() => {
    if (!visible || !permission?.granted) return;
    return addMediaLibraryChangeListener(() => {
      void loadFirstPage(activeAlbumId, queryMediaTypes);
    }).remove;
  }, [
    activeAlbumId,
    loadFirstPage,
    permission?.granted,
    queryMediaTypes,
    visible,
  ]);

  const requestAccess = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const nextPermission = await requestMediaLibraryPermissionsAsync([
        'images',
        'videos',
      ]);
      setPermission(nextPermission);
      if (nextPermission.granted)
        await loadFirstPage(undefined, queryMediaTypes);
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }, [busy, loadFirstPage, queryMediaTypes, reportError]);

  const chooseAlbum = useCallback(
    (albumId?: string) => {
      if (loading || albumId === activeAlbumId) return;
      setActiveAlbumId(albumId);
      void loadFirstPage(albumId, queryMediaTypes);
    },
    [activeAlbumId, loadFirstPage, loading, queryMediaTypes],
  );

  const chooseMediaFilter = useCallback(
    (nextFilter: MediaFilter) => {
      if (loading || nextFilter === mediaFilter) return;
      const nextMediaTypes = mediaTypesForFilter(nextFilter);
      setMediaFilter(nextFilter);
      setActiveAlbumId(undefined);
      void loadFirstPage(undefined, nextMediaTypes);
    },
    [loadFirstPage, loading, mediaFilter],
  );

  const manageLimitedAccess = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMessage(undefined);
    try {
      await presentLimitedLibraryPickerAsync(['images', 'videos']);
      const nextPermission = await getMediaLibraryPermissionsAsync([
        'images',
        'videos',
      ]);
      setPermission(nextPermission);
      await loadFirstPage(activeAlbumId, queryMediaTypes);
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }, [activeAlbumId, busy, loadFirstPage, queryMediaTypes, reportError]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasNextPage || !endCursor) return;
    setLoadingMore(true);
    try {
      const page = await getAssetsAsync({
        after: endCursor,
        albumId: activeAlbumId,
        first: PAGE_SIZE,
        mediaTypes: queryMediaTypes,
      });
      setAssets((current) => {
        const knownIds = new Set(current.map((asset) => asset.assetId));
        return [
          ...current,
          ...page.assets.filter((asset) => !knownIds.has(asset.assetId)),
        ];
      });
      setEndCursor(page.endCursor);
      setHasNextPage(page.hasNextPage);
    } catch (error) {
      reportError(error);
    } finally {
      setLoadingMore(false);
    }
  }, [
    activeAlbumId,
    endCursor,
    hasNextPage,
    loading,
    loadingMore,
    queryMediaTypes,
    reportError,
  ]);

  const toggleSelection = useCallback((asset: MediaAsset) => {
    setMessage(undefined);
    setSelectedAssets((current) => {
      if (
        current.some((currentAsset) => currentAsset.assetId === asset.assetId)
      )
        return current.filter(
          (currentAsset) => currentAsset.assetId !== asset.assetId,
        );
      if (current.length >= SELECTION_LIMIT) {
        setMessage(`最多选择 ${SELECTION_LIMIT} 项`);
        return current;
      }
      return [...current, asset];
    });
  }, []);

  const selectedIds = useMemo(
    () => selectedAssets.map((asset) => asset.assetId),
    [selectedAssets],
  );

  const confirm = useCallback(async () => {
    if (busy || selectedIds.length === 0) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const resolvedAssets = await resolveAssetsAsync(selectedIds, {
        shouldDownloadFromNetwork: true,
      });
      if (resolvedAssets.length !== selectedIds.length) {
        throw new NitroImagePickerError(
          'E_EXPORT_FAILED',
          '部分资源无法导出，请重新选择',
        );
      }
      onComplete({ canceled: false, assets: resolvedAssets });
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }, [busy, onComplete, reportError, selectedIds]);

  const cellSize = Math.max(
    1,
    Math.floor((width - GRID_SIDE_PADDING * 2) / GRID_COLUMNS - GRID_GAP),
  );

  const selectedIndexes = useMemo(
    () => new Map(selectedIds.map((assetId, index) => [assetId, index + 1])),
    [selectedIds],
  );

  const renderAsset = useCallback(
    ({ item }: ListRenderItemInfo<MediaAsset>) => {
      const selectedIndex = selectedIndexes.get(item.assetId);
      return (
        <Pressable
          accessibilityLabel={
            selectedIndex
              ? `取消选择第 ${selectedIndex} 项`
              : `选择 ${item.fileName ?? '媒体'}`
          }
          accessibilityRole="button"
          onPress={() => toggleSelection(item)}
          style={[
            styles.assetCard,
            selectedIndex ? styles.assetCardSelected : undefined,
            { width: cellSize },
          ]}
        >
          <View style={[styles.assetPreview, { height: cellSize * 0.78 }]}>
            <MediaThumbnail
              assetId={item.assetId}
              shouldDownloadFromNetwork
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[
                styles.selectionBadge,
                selectedIndex ? styles.selectionBadgeActive : undefined,
              ]}
            >
              <Text style={styles.selectionBadgeText}>
                {selectedIndex ?? '+'}
              </Text>
            </View>
            {item.type === 'video' ? (
              <Text style={styles.duration}>
                {formatDuration(item.duration)}
              </Text>
            ) : null}
          </View>
          <View style={styles.assetMeta}>
            <Text numberOfLines={1} style={styles.assetName}>
              {item.fileName ?? '未命名素材'}
            </Text>
            <Text style={styles.assetDetails}>
              {item.type === 'video' ? '视频' : '图片'} · {item.width} ×{' '}
              {item.height}
            </Text>
          </View>
        </Pressable>
      );
    },
    [cellSize, selectedIndexes, toggleSelection],
  );

  const renderSelectedAsset = useCallback(
    ({ item, index }: ListRenderItemInfo<MediaAsset>) => (
      <Pressable
        accessibilityLabel={`移除第 ${index + 1} 项`}
        accessibilityRole="button"
        onPress={() => toggleSelection(item)}
        style={styles.selectedThumb}
      >
        <MediaThumbnail
          assetId={item.assetId}
          shouldDownloadFromNetwork
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.selectedThumbIndex}>
          <Text style={styles.selectedThumbIndexText}>{index + 1}</Text>
        </View>
      </Pressable>
    ),
    [toggleSelection],
  );

  return (
    <Modal
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={onCancel}
      statusBarTranslucent
      visible={visible}
    >
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <View style={styles.headerTitleGroup}>
            <Text style={styles.eyebrow}>CUSTOM WORKSPACE</Text>
            <Text style={styles.title}>素材选择台</Text>
          </View>
          <View style={styles.headerCounter}>
            <Text style={styles.headerCounterText}>
              {selectedIds.length}/{SELECTION_LIMIT}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="关闭自定义选择器"
            onPress={onCancel}
            style={styles.iconButton}
          >
            <Text style={styles.closeIcon}>×</Text>
          </Pressable>
        </View>

        {!permission?.granted ? (
          <View style={styles.permissionBody}>
            {loading ? <ActivityIndicator color="#e45745" /> : null}
            <Text selectable style={styles.permissionTitle}>
              浏览设备媒体
            </Text>
            <Text selectable style={styles.permissionDescription}>
              此示例由业务层自行申请权限、分页查询并渲染缩略图。
            </Text>
            <Pressable
              disabled={busy}
              onPress={() =>
                permission?.canAskAgain === false
                  ? void Linking.openSettings()
                  : void requestAccess()
              }
              style={styles.permissionButton}
            >
              {busy ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.permissionButtonText}>
                  {permission?.canAskAgain === false ? '打开设置' : '授权访问'}
                </Text>
              )}
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.controlPanel}>
              <View style={styles.controlHeading}>
                <View>
                  <Text style={styles.controlEyebrow}>媒体类型</Text>
                  <Text style={styles.controlTitle}>筛选素材</Text>
                </View>
                <Pressable
                  accessibilityLabel="刷新当前素材"
                  disabled={loading}
                  onPress={() =>
                    void loadFirstPage(activeAlbumId, queryMediaTypes)
                  }
                  style={styles.refreshButton}
                >
                  {loading ? (
                    <ActivityIndicator color="#1d2c27" size="small" />
                  ) : (
                    <Text style={styles.refreshButtonText}>刷新</Text>
                  )}
                </Pressable>
              </View>
              <View style={styles.segmentedControl}>
                {(
                  [
                    ['all', '全部'],
                    ['images', '图片'],
                    ['videos', '视频'],
                  ] as const
                ).map(([value, label]) => (
                  <Pressable
                    accessibilityRole="button"
                    key={value}
                    onPress={() => chooseMediaFilter(value)}
                    style={[
                      styles.segment,
                      mediaFilter === value ? styles.segmentActive : undefined,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        mediaFilter === value
                          ? styles.segmentTextActive
                          : undefined,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {permission.accessPrivileges === 'limited' ? (
              <View style={styles.limitedBanner}>
                <View style={styles.limitedCopy}>
                  <Text style={styles.limitedTitle}>有限照片访问</Text>
                  <Text style={styles.limitedDescription}>
                    当前仅展示已授权的媒体项目
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="管理可访问项目"
                  disabled={busy}
                  onPress={() => void manageLimitedAccess()}
                  style={styles.limitedButton}
                >
                  <Text style={styles.limitedButtonText}>管理</Text>
                </Pressable>
              </View>
            ) : null}

            <ScrollView
              contentContainerStyle={styles.albumList}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              <Pressable
                onPress={() => chooseAlbum()}
                style={[
                  styles.albumChip,
                  !activeAlbumId ? styles.albumChipActive : undefined,
                ]}
              >
                <Text style={styles.albumChipText}>全部</Text>
              </Pressable>
              {albums.map((album) => (
                <Pressable
                  key={album.id}
                  onPress={() => chooseAlbum(album.id)}
                  style={[
                    styles.albumChip,
                    activeAlbumId === album.id
                      ? styles.albumChipActive
                      : undefined,
                  ]}
                >
                  <Text numberOfLines={1} style={styles.albumChipText}>
                    {album.title} {album.assetCount}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {message ? (
              <Pressable
                onPress={() => setMessage(undefined)}
                style={styles.messageBar}
              >
                <Text selectable style={styles.messageText}>
                  {message}
                </Text>
              </Pressable>
            ) : null}

            {loading ? (
              <View style={styles.loadingBody}>
                <ActivityIndicator color="#e45745" />
              </View>
            ) : (
              <FlashList
                contentContainerStyle={
                  assets.length ? styles.assetList : styles.emptyList
                }
                data={assets}
                extraData={selectedIds}
                keyExtractor={(asset) => asset.assetId}
                ListEmptyComponent={
                  <Text selectable style={styles.emptyText}>
                    当前相册没有照片或视频
                  </Text>
                }
                ListFooterComponent={
                  loadingMore ? <ActivityIndicator color="#e45745" /> : null
                }
                numColumns={GRID_COLUMNS}
                onEndReached={() => void loadMore()}
                onEndReachedThreshold={0.5}
                renderItem={renderAsset}
              />
            )}

            <View style={styles.footer}>
              <View style={styles.selectionTray}>
                {selectedAssets.length ? (
                  <FlashList
                    contentContainerStyle={styles.selectedThumbRow}
                    data={selectedAssets}
                    horizontal
                    keyExtractor={(asset) => asset.assetId}
                    renderItem={renderSelectedAsset}
                    showsHorizontalScrollIndicator={false}
                    style={styles.selectedThumbList}
                  />
                ) : (
                  <Text style={styles.footerTitle}>尚未选择素材</Text>
                )}
                <Text style={styles.footerCount}>
                  已选 {selectedIds.length} 项
                </Text>
              </View>
              <Pressable
                disabled={busy || selectedIds.length === 0}
                onPress={() => void confirm()}
                style={[
                  styles.confirmButton,
                  selectedIds.length === 0
                    ? styles.confirmButtonDisabled
                    : undefined,
                ]}
              >
                {busy ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.confirmButtonText}>导出所选内容</Text>
                )}
              </Pressable>
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#f3f4ef', flex: 1 },
  header: {
    alignItems: 'center',
    backgroundColor: '#1d2c27',
    borderBottomColor: '#0f1a16',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 72,
    paddingHorizontal: 16,
  },
  iconButton: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  closeIcon: { color: '#ffffff', fontSize: 34, lineHeight: 38 },
  headerTitleGroup: { flex: 1, gap: 2 },
  eyebrow: {
    color: '#f5b35a',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
  },
  title: { color: '#ffffff', fontSize: 20, fontWeight: '800' },
  headerCounter: {
    alignItems: 'center',
    backgroundColor: '#e45745',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 28,
    minWidth: 48,
    paddingHorizontal: 8,
  },
  headerCounterText: {
    color: '#ffffff',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  permissionBody: {
    alignItems: 'center',
    flex: 1,
    gap: 14,
    justifyContent: 'center',
    padding: 28,
  },
  permissionTitle: { color: '#17221e', fontSize: 21, fontWeight: '700' },
  permissionDescription: {
    color: '#66716b',
    lineHeight: 21,
    maxWidth: 320,
    textAlign: 'center',
  },
  permissionButton: {
    alignItems: 'center',
    backgroundColor: '#1d2c27',
    borderRadius: 6,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 132,
    paddingHorizontal: 18,
  },
  permissionButtonText: { color: '#ffffff', fontWeight: '700' },
  controlPanel: {
    backgroundColor: '#e8eadf',
    borderBottomColor: '#cfd3c8',
    borderBottomWidth: 1,
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  controlHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  controlEyebrow: {
    color: '#8b4b35',
    fontSize: 10,
    fontWeight: '800',
  },
  controlTitle: { color: '#1d2c27', fontSize: 16, fontWeight: '800' },
  refreshButton: {
    alignItems: 'center',
    borderColor: '#1d2c27',
    borderRadius: 5,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    minWidth: 64,
    paddingHorizontal: 12,
  },
  refreshButtonText: { color: '#1d2c27', fontSize: 12, fontWeight: '800' },
  segmentedControl: {
    backgroundColor: '#d6dbcf',
    borderRadius: 6,
    flexDirection: 'row',
    gap: 3,
    padding: 3,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 4,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
  },
  segmentActive: { backgroundColor: '#1d2c27' },
  segmentText: { color: '#56625b', fontSize: 13, fontWeight: '700' },
  segmentTextActive: { color: '#ffffff' },
  limitedBanner: {
    alignItems: 'center',
    backgroundColor: '#fff3cf',
    borderBottomColor: '#ead394',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  limitedCopy: { flex: 1 },
  limitedTitle: { color: '#654b0b', fontSize: 13, fontWeight: '800' },
  limitedDescription: { color: '#806b37', fontSize: 11, marginTop: 2 },
  limitedButton: {
    alignItems: 'center',
    borderColor: '#654b0b',
    borderRadius: 4,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 32,
    minWidth: 60,
    paddingHorizontal: 10,
  },
  limitedButtonText: { color: '#654b0b', fontSize: 12, fontWeight: '800' },
  albumList: { gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  albumChip: {
    backgroundColor: '#ffffff',
    borderColor: '#d5d8d1',
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    maxWidth: 180,
    minHeight: 34,
    paddingHorizontal: 12,
  },
  albumChipActive: { backgroundColor: '#ffd66b', borderColor: '#1d2c27' },
  albumChipText: { color: '#243029', fontSize: 13, fontWeight: '600' },
  messageBar: {
    alignItems: 'center',
    backgroundColor: '#ffe8e3',
    minHeight: 38,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  messageText: { color: '#a52f24', fontSize: 13 },
  loadingBody: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  emptyList: { alignItems: 'center', flexGrow: 1, justifyContent: 'center' },
  emptyText: { color: '#66716b' },
  assetList: {
    paddingBottom: 16,
    paddingHorizontal: GRID_SIDE_PADDING,
  },
  assetCard: {
    backgroundColor: '#ffffff',
    borderColor: '#dcded7',
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: GRID_GAP,
    marginHorizontal: GRID_GAP / 2,
    overflow: 'hidden',
  },
  assetCardSelected: {
    borderColor: '#e45745',
    borderWidth: 2,
  },
  assetPreview: { overflow: 'hidden', position: 'relative', width: '100%' },
  assetMeta: { gap: 3, paddingHorizontal: 9, paddingVertical: 8 },
  assetName: { color: '#1d2924', fontSize: 13, fontWeight: '700' },
  assetDetails: {
    color: '#778079',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  selectionBadge: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#1d2c27',
    borderRadius: 13,
    borderWidth: 1.5,
    height: 26,
    justifyContent: 'center',
    position: 'absolute',
    right: 7,
    top: 7,
    width: 26,
  },
  selectionBadgeActive: { backgroundColor: '#ffd15a', borderColor: '#1d2c27' },
  selectionBadgeText: {
    color: '#1d2c27',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  duration: {
    backgroundColor: 'rgba(0,0,0,0.56)',
    borderRadius: 3,
    bottom: 6,
    color: '#ffffff',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    paddingHorizontal: 5,
    paddingVertical: 2,
    position: 'absolute',
    right: 6,
  },
  footer: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderTopColor: '#d5d8d1',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 16,
    minHeight: 82,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  selectionTray: { flex: 1, gap: 4 },
  selectedThumbList: { height: 38 },
  selectedThumbRow: { gap: 6 },
  selectedThumb: {
    borderColor: '#1d2c27',
    borderRadius: 4,
    borderWidth: 1,
    height: 38,
    overflow: 'hidden',
    width: 38,
  },
  selectedThumbIndex: {
    alignItems: 'center',
    backgroundColor: '#ffd15a',
    borderBottomLeftRadius: 4,
    height: 17,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    top: 0,
    width: 17,
  },
  selectedThumbIndexText: {
    color: '#1d2c27',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  footerTitle: { color: '#7a827d', fontSize: 12 },
  footerCount: {
    color: '#1d2c27',
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  confirmButton: {
    alignItems: 'center',
    backgroundColor: '#1d2c27',
    borderRadius: 6,
    justifyContent: 'center',
    minHeight: 42,
    minWidth: 136,
    paddingHorizontal: 16,
  },
  confirmButtonDisabled: { backgroundColor: '#c8ccc7' },
  confirmButtonText: { color: '#ffffff', fontWeight: '800' },
});
