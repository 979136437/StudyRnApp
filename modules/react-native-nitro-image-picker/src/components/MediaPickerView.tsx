import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  addMediaLibraryChangeListener,
  getAlbumsAsync,
  getAssetsAsync,
  getMediaLibraryPermissionsAsync,
  launchCameraAsync,
  presentLimitedLibraryPickerAsync,
  requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
  requestMicrophonePermissionsAsync,
  resolveAssetsAsync,
} from '../api/image-picker';
import { normalizeMediaTypes } from '../api/normalize-options';
import { DEFAULT_PAGE_SIZE } from '../core/constants';
import {
  createSelectionState,
  getSelectionIndex,
  mergeResolvedSelection,
  selectionReducer,
} from '../core/selection';
import { NitroImagePickerError } from '../types';
import type {
  MediaAlbum,
  MediaAsset,
  MediaPermissionResponse,
  MediaPickerAssetRenderContext,
  MediaPickerLabels,
  MediaPickerTheme,
  MediaPickerViewProps,
} from '../types';
import { DARK_THEME, DEFAULT_LABELS, LIGHT_THEME } from './constants';
import { MediaThumbnail } from './MediaThumbnail';
import { normalizePickerUiOptions } from './normalize-picker-options';

const GRID_GAP = 2;

function formatDuration(duration?: number): string {
  if (!duration || duration <= 0) return '';
  const totalSeconds = Math.round(duration / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function MediaPickerView({
  allowCamera = true,
  cameraType = 'back',
  columns,
  initialSelectedAssetIds = [],
  labels: labelOverrides,
  mediaTypes: requestedMediaTypes,
  onCancel,
  onComplete,
  onError,
  renderAssetOverlay,
  renderEmpty,
  renderHeader,
  renderPermissionDenied,
  selectionLimit,
  shouldDownloadFromNetwork = true,
  style,
  theme: themeOverrides,
}: MediaPickerViewProps): React.JSX.Element {
  const colorScheme = useColorScheme();
  const normalizedUi = normalizePickerUiOptions({ columns, selectionLimit });
  const mediaTypesKey = requestedMediaTypes?.join('|') ?? '';
  const mediaTypes = useMemo(
    () => normalizeMediaTypes(requestedMediaTypes),
    // 字符串键避免调用方内联数组导致授权和分页 effect 重复执行。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mediaTypesKey],
  );
  const theme = useMemo<MediaPickerTheme>(
    () => ({
      ...(colorScheme === 'dark' ? DARK_THEME : LIGHT_THEME),
      ...themeOverrides,
    }),
    [colorScheme, themeOverrides],
  );
  const labels = useMemo<MediaPickerLabels>(
    () => ({ ...DEFAULT_LABELS, ...labelOverrides }),
    [labelOverrides],
  );

  const [permission, setPermission] = useState<MediaPermissionResponse>();
  const [albums, setAlbums] = useState<MediaAlbum[]>([]);
  const [activeAlbum, setActiveAlbum] = useState<MediaAlbum>();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [endCursor, setEndCursor] = useState<string>();
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [containerWidth, setContainerWidth] = useState(0);
  const [albumsVisible, setAlbumsVisible] = useState(false);
  const [cameraMenuVisible, setCameraMenuVisible] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<MediaAsset>();
  const [selection, dispatchSelection] = useReducer(
    selectionReducer,
    initialSelectedAssetIds,
    createSelectionState,
  );
  const requestSerial = useRef(0);

  const reportError = useCallback(
    (error: unknown) => {
      const normalized =
        error instanceof NitroImagePickerError
          ? error
          : new NitroImagePickerError('E_UNKNOWN', errorMessage(error), {
              cause: error,
            });
      setMessage(normalized.message);
      onError?.(normalized);
    },
    [onError],
  );

  const loadLibrary = useCallback(
    async (album?: MediaAlbum) => {
      const serial = ++requestSerial.current;
      setLoading(true);
      setMessage(undefined);
      try {
        const [nextAlbums, page] = await Promise.all([
          getAlbumsAsync({ mediaTypes, includeSmartAlbums: true }),
          getAssetsAsync({
            albumId: album?.id,
            mediaTypes,
            first: DEFAULT_PAGE_SIZE,
          }),
        ]);
        if (requestSerial.current !== serial) return;
        setAlbums(nextAlbums);
        setAssets(page.assets);
        setEndCursor(page.endCursor);
        setHasNextPage(page.hasNextPage);
      } catch (error) {
        if (requestSerial.current === serial) reportError(error);
      } finally {
        if (requestSerial.current === serial) setLoading(false);
      }
    },
    [mediaTypes, reportError],
  );

  const checkPermission = useCallback(async () => {
    setLoading(true);
    try {
      const nextPermission = await getMediaLibraryPermissionsAsync(mediaTypes);
      setPermission(nextPermission);
      if (nextPermission.granted) await loadLibrary();
    } catch (error) {
      reportError(error);
      setLoading(false);
    }
  }, [loadLibrary, mediaTypes, reportError]);

  useEffect(() => {
    void checkPermission();
    return () => {
      requestSerial.current += 1;
    };
  }, [checkPermission]);

  useEffect(() => {
    if (!permission?.granted) return;
    return addMediaLibraryChangeListener(() => {
      void loadLibrary(activeAlbum);
    }).remove;
  }, [activeAlbum, loadLibrary, permission?.granted]);

  const requestAccess = useCallback(async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      const nextPermission =
        await requestMediaLibraryPermissionsAsync(mediaTypes);
      setPermission(nextPermission);
      if (nextPermission.granted) await loadLibrary(activeAlbum);
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }, [activeAlbum, loadLibrary, mediaTypes, reportError]);

  const manageLimitedAccess = useCallback(async () => {
    setBusy(true);
    try {
      await presentLimitedLibraryPickerAsync(mediaTypes);
      const nextPermission = await getMediaLibraryPermissionsAsync(mediaTypes);
      setPermission(nextPermission);
      await loadLibrary(activeAlbum);
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }, [activeAlbum, loadLibrary, mediaTypes, reportError]);

  const loadMore = useCallback(async () => {
    if (!hasNextPage || !endCursor || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const page = await getAssetsAsync({
        albumId: activeAlbum?.id,
        mediaTypes,
        first: DEFAULT_PAGE_SIZE,
        after: endCursor,
      });
      setAssets((current) => {
        const known = new Set(current.map((asset) => asset.assetId));
        return [
          ...current,
          ...page.assets.filter((asset) => !known.has(asset.assetId)),
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
    activeAlbum?.id,
    endCursor,
    hasNextPage,
    loading,
    loadingMore,
    mediaTypes,
    reportError,
  ]);

  const chooseAlbum = useCallback(
    (album?: MediaAlbum) => {
      setAlbumsVisible(false);
      setActiveAlbum(album);
      void loadLibrary(album);
    },
    [loadLibrary],
  );

  const capture = useCallback(
    async (mediaType: 'image' | 'video') => {
      setCameraMenuVisible(false);
      if (selection.selectedIds.length >= normalizedUi.selectionLimit) {
        setMessage(labels.selectionLimitReached);
        return;
      }
      setBusy(true);
      setMessage(undefined);
      try {
        const cameraPermission = await requestCameraPermissionsAsync();
        if (!cameraPermission.granted) {
          throw new NitroImagePickerError(
            'E_PERMISSION_DENIED',
            labels.grantAccessDescription,
          );
        }
        if (mediaType === 'video') {
          const microphonePermission =
            await requestMicrophonePermissionsAsync();
          if (!microphonePermission.granted) {
            throw new NitroImagePickerError(
              'E_PERMISSION_DENIED',
              labels.grantAccessDescription,
            );
          }
        }
        const result = await launchCameraAsync({ mediaType, cameraType });
        if (!result.canceled) {
          for (const asset of result.assets ?? []) {
            dispatchSelection({
              type: 'capture',
              asset,
              limit: normalizedUi.selectionLimit,
            });
          }
          await loadLibrary(activeAlbum);
        }
      } catch (error) {
        reportError(error);
      } finally {
        setBusy(false);
      }
    },
    [
      activeAlbum,
      cameraType,
      labels.grantAccessDescription,
      labels.selectionLimitReached,
      loadLibrary,
      normalizedUi.selectionLimit,
      reportError,
      selection.selectedIds.length,
    ],
  );

  const openCamera = useCallback(() => {
    if (mediaTypes.length > 1) {
      setCameraMenuVisible(true);
    } else {
      void capture(mediaTypes[0] === 'videos' ? 'video' : 'image');
    }
  }, [capture, mediaTypes]);

  const confirm = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const libraryIds = selection.selectedIds.filter(
        (assetId) => !(assetId in selection.capturedAssets),
      );
      const resolved = await resolveAssetsAsync(libraryIds, {
        shouldDownloadFromNetwork,
      });
      const completedAssets = mergeResolvedSelection(selection, resolved);
      if (completedAssets.length !== selection.selectedIds.length) {
        throw new NitroImagePickerError(
          'E_EXPORT_FAILED',
          '部分资源已不可用，请刷新后重试',
        );
      }
      onComplete({ canceled: false, assets: completedAssets });
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }, [busy, onComplete, reportError, selection, shouldDownloadFromNetwork]);

  const renderContext = useMemo(
    () => ({
      selectedCount: selection.selectedIds.length,
      selectionLimit: normalizedUi.selectionLimit,
      busy,
    }),
    [busy, normalizedUi.selectionLimit, selection.selectedIds.length],
  );

  const cellSize = Math.max(
    1,
    Math.floor(
      (containerWidth - GRID_GAP * (normalizedUi.columns - 1)) /
        normalizedUi.columns,
    ),
  );

  const renderAsset = useCallback(
    ({ item }: ListRenderItemInfo<MediaAsset>) => {
      const selectedIndex = getSelectionIndex(selection, item.assetId);
      const toggleSelection = () => {
        if (
          !selectedIndex &&
          selection.selectedIds.length >= normalizedUi.selectionLimit
        ) {
          setMessage(labels.selectionLimitReached);
          return;
        }
        setMessage(undefined);
        dispatchSelection({
          type: 'toggle',
          assetId: item.assetId,
          limit: normalizedUi.selectionLimit,
        });
      };
      const overlayContext: MediaPickerAssetRenderContext = {
        ...renderContext,
        asset: item,
        selectedIndex,
        toggleSelection,
        openPreview: () => setPreviewAsset(item),
      };
      return (
        <Pressable
          accessibilityLabel={`${labels.preview} ${item.fileName ?? ''}`.trim()}
          onLongPress={() => setPreviewAsset(item)}
          onPress={toggleSelection}
          style={{ height: cellSize, width: cellSize }}
        >
          <MediaThumbnail
            assetId={item.assetId}
            shouldDownloadFromNetwork
            style={StyleSheet.absoluteFill}
          />
          {item.type === 'video' ? (
            <Text style={[styles.duration, { color: '#ffffff' }]}>
              {formatDuration(item.duration)}
            </Text>
          ) : null}
          {renderAssetOverlay ? (
            renderAssetOverlay(overlayContext)
          ) : (
            <Pressable
              accessibilityLabel={
                selectedIndex ? `已选择 ${selectedIndex}` : '选择'
              }
              onPress={(event) => {
                event.stopPropagation();
                toggleSelection();
              }}
              style={[
                styles.selectionBadge,
                {
                  backgroundColor: selectedIndex ? theme.accent : theme.overlay,
                  borderColor: '#ffffff',
                },
              ]}
            >
              <Text style={styles.selectionText}>{selectedIndex || ''}</Text>
            </Pressable>
          )}
        </Pressable>
      );
    },
    [
      cellSize,
      labels.preview,
      labels.selectionLimitReached,
      normalizedUi.selectionLimit,
      renderAssetOverlay,
      renderContext,
      selection,
      theme.accent,
      theme.overlay,
    ],
  );

  const defaultHeader = (
    <View style={[styles.header, { borderBottomColor: theme.separator }]}>
      <Pressable
        disabled={busy}
        onPress={onCancel}
        style={styles.commandButton}
      >
        <Text style={{ color: theme.text }}>{labels.cancel}</Text>
      </Pressable>
      <Pressable
        onPress={() => setAlbumsVisible(true)}
        style={styles.albumButton}
      >
        <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
          {activeAlbum?.title ?? labels.allMedia}
        </Text>
        <Text style={{ color: theme.secondaryText }}>{labels.albums}</Text>
      </Pressable>
      <Pressable
        disabled={busy || selection.selectedIds.length === 0}
        onPress={() => void confirm()}
        style={[styles.doneButton, { backgroundColor: theme.accent }]}
      >
        {busy ? (
          <ActivityIndicator color="#ffffff" size="small" />
        ) : (
          <Text style={styles.doneText}>
            {labels.done}
            {selection.selectedIds.length
              ? ` (${selection.selectedIds.length})`
              : ''}
          </Text>
        )}
      </Pressable>
    </View>
  );

  const renderPermission = () => {
    if (!permission)
      return <ActivityIndicator color={theme.accent as string} />;
    if (renderPermissionDenied) return renderPermissionDenied(permission);
    return (
      <View style={styles.centered}>
        <Text
          selectable
          style={[styles.permissionTitle, { color: theme.text }]}
        >
          {labels.grantAccessTitle}
        </Text>
        <Text
          selectable
          style={[styles.permissionDescription, { color: theme.secondaryText }]}
        >
          {labels.grantAccessDescription}
        </Text>
        <Pressable
          disabled={busy}
          onPress={
            permission.canAskAgain
              ? () => void requestAccess()
              : () => void Linking.openSettings()
          }
          style={[styles.primaryButton, { backgroundColor: theme.accent }]}
        >
          <Text style={styles.doneText}>
            {permission.canAskAgain ? labels.grantAccess : labels.openSettings}
          </Text>
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: theme.background }, style]}
    >
      {renderHeader ? renderHeader(renderContext) : defaultHeader}
      {message ? (
        <Pressable
          onPress={() => setMessage(undefined)}
          style={styles.messageRow}
        >
          <Text selectable style={{ color: theme.danger }}>
            {message}
          </Text>
        </Pressable>
      ) : null}
      {!permission?.granted ? (
        <View style={styles.flexCenter}>{renderPermission()}</View>
      ) : (
        <View
          onLayout={(event) =>
            setContainerWidth(event.nativeEvent.layout.width)
          }
          style={styles.listContainer}
        >
          {permission.accessPrivileges === 'limited' ? (
            <Pressable
              disabled={busy}
              onPress={() => void manageLimitedAccess()}
              style={[styles.limitedButton, { backgroundColor: theme.surface }]}
            >
              <Text style={{ color: theme.accent }}>{labels.manageAccess}</Text>
            </Pressable>
          ) : null}
          {allowCamera ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={openCamera}
              style={[styles.cameraRow, { backgroundColor: theme.surface }]}
            >
              <Text style={[styles.cameraText, { color: theme.text }]}>
                {mediaTypes.length > 1
                  ? `${labels.takePhoto} / ${labels.recordVideo}`
                  : mediaTypes[0] === 'videos'
                    ? labels.recordVideo
                    : labels.takePhoto}
              </Text>
            </Pressable>
          ) : null}
          {loading ? (
            <View style={styles.flexCenter}>
              <ActivityIndicator color={theme.accent as string} />
            </View>
          ) : (
            <FlatList
              columnWrapperStyle={
                normalizedUi.columns > 1 ? { gap: GRID_GAP } : undefined
              }
              contentContainerStyle={
                assets.length ? { gap: GRID_GAP } : styles.emptyList
              }
              data={assets}
              extraData={selection.selectedIds}
              key={normalizedUi.columns}
              keyExtractor={(asset) => asset.assetId}
              ListEmptyComponent={
                renderEmpty ? (
                  <>{renderEmpty()}</>
                ) : (
                  <Text selectable style={{ color: theme.secondaryText }}>
                    {labels.empty}
                  </Text>
                )
              }
              ListFooterComponent={
                loadingMore ? (
                  <ActivityIndicator color={theme.accent as string} />
                ) : null
              }
              numColumns={normalizedUi.columns}
              onEndReached={() => void loadMore()}
              onEndReachedThreshold={0.5}
              renderItem={renderAsset}
            />
          )}
        </View>
      )}

      <Modal
        animationType="fade"
        onRequestClose={() => setAlbumsVisible(false)}
        transparent
        visible={albumsVisible}
      >
        <Pressable
          onPress={() => setAlbumsVisible(false)}
          style={styles.modalBackdrop}
        >
          <View style={[styles.sheet, { backgroundColor: theme.background }]}>
            <Pressable
              onPress={() => chooseAlbum(undefined)}
              style={styles.albumRow}
            >
              <Text style={{ color: theme.text }}>{labels.allMedia}</Text>
            </Pressable>
            {albums.map((album) => (
              <Pressable
                key={album.id}
                onPress={() => chooseAlbum(album)}
                style={styles.albumRow}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.albumName, { color: theme.text }]}
                >
                  {album.title}
                </Text>
                <Text style={{ color: theme.secondaryText }}>
                  {album.assetCount}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setCameraMenuVisible(false)}
        transparent
        visible={cameraMenuVisible}
      >
        <Pressable
          onPress={() => setCameraMenuVisible(false)}
          style={styles.modalBackdrop}
        >
          <View style={[styles.sheet, { backgroundColor: theme.background }]}>
            <Pressable
              onPress={() => void capture('image')}
              style={styles.menuCommand}
            >
              <Text style={[styles.menuText, { color: theme.text }]}>
                {labels.takePhoto}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void capture('video')}
              style={styles.menuCommand}
            >
              <Text style={[styles.menuText, { color: theme.text }]}>
                {labels.recordVideo}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setPreviewAsset(undefined)}
        visible={Boolean(previewAsset)}
      >
        <SafeAreaView
          style={[styles.previewRoot, { backgroundColor: '#000000' }]}
        >
          <View style={styles.previewHeader}>
            <Pressable
              onPress={() => setPreviewAsset(undefined)}
              style={styles.commandButton}
            >
              <Text style={{ color: '#ffffff' }}>{labels.closePreview}</Text>
            </Pressable>
            {previewAsset ? (
              <Pressable
                onPress={() =>
                  dispatchSelection({
                    type: 'toggle',
                    assetId: previewAsset.assetId,
                    limit: normalizedUi.selectionLimit,
                  })
                }
                style={[styles.doneButton, { backgroundColor: theme.accent }]}
              >
                <Text style={styles.doneText}>
                  {getSelectionIndex(selection, previewAsset.assetId) || '选择'}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {previewAsset ? (
            <MediaThumbnail
              assetId={previewAsset.assetId}
              resizeMode="contain"
              shouldDownloadFromNetwork
              style={styles.previewMedia}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 52,
    paddingHorizontal: 12,
  },
  commandButton: { justifyContent: 'center', minHeight: 44, minWidth: 52 },
  albumButton: { alignItems: 'center', flex: 1, paddingHorizontal: 8 },
  title: { fontSize: 16, fontWeight: '600' },
  doneButton: {
    alignItems: 'center',
    borderRadius: 6,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 64,
    paddingHorizontal: 10,
  },
  doneText: { color: '#ffffff', fontWeight: '600' },
  messageRow: { alignItems: 'center', minHeight: 36, paddingHorizontal: 12 },
  listContainer: { flex: 1 },
  flexCenter: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  centered: { alignItems: 'center', gap: 14, maxWidth: 320, padding: 24 },
  permissionTitle: { fontSize: 20, fontWeight: '600' },
  permissionDescription: { lineHeight: 21, textAlign: 'center' },
  primaryButton: {
    borderRadius: 6,
    minWidth: 120,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  limitedButton: {
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  cameraRow: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  cameraText: { fontWeight: '600' },
  emptyList: { alignItems: 'center', flexGrow: 1, justifyContent: 'center' },
  selectionBadge: {
    alignItems: 'center',
    borderRadius: 11,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: 6,
    top: 6,
    width: 22,
  },
  selectionText: {
    color: '#ffffff',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  duration: {
    bottom: 5,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    position: 'absolute',
    right: 5,
  },
  modalBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    maxHeight: '72%',
    padding: 12,
  },
  albumRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 8,
  },
  albumName: { flex: 1 },
  menuCommand: {
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  menuText: { fontSize: 17 },
  previewRoot: { flex: 1 },
  previewHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  previewMedia: { flex: 1 },
});
