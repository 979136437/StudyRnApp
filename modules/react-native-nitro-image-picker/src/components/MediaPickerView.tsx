import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
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
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

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
  calculateGridCellSize,
  normalizeMeasuredWidth,
} from '../core/grid-layout';
import {
  createSelectedPreviewItems,
  type PreviewMode,
} from '../core/preview';
import {
  createSelectionState,
  getSelectionIndex,
  mergeResolvedSelection,
  selectionReducer,
} from '../core/selection';
import { reconcileOrderedItems } from '../core/reconcile-items';
import { useLatestRef } from '../react/use-latest-ref';
import { NitroImagePickerError } from '../types';
import type {
  MediaAlbum,
  MediaAsset,
  MediaPermissionResponse,
  MediaPickerAssetRenderContext,
  MediaPickerTheme,
  MediaPickerViewProps,
} from '../types';
import { AlbumPickerRow } from './AlbumPickerRow';
import {
  DARK_THEME,
  DEFAULT_LABELS,
  type ResolvedMediaPickerLabels,
} from './constants';
import { MediaThumbnail } from './MediaThumbnail';
import { MediaPreviewModal } from './MediaPreviewModal';
import { normalizePickerUiOptions } from './normalize-picker-options';

const GRID_GAP = 2;
const GRID_PADDING = 0;
const PICKER_HEADER_HEIGHT = 56;
const ALBUM_ROW_HEIGHT = 82;
const ALBUM_SHEET_BOTTOM_GAP = 72;
const PICKER_CHROME_COLOR = '#353537';
const PICKER_PILL_COLOR = '#4a4a4c';
const PICKER_FOOTER_COLOR = '#1c1c1e';
const LIBRARY_CHANGE_DEBOUNCE_MS = 120;

type PickerGridItem =
  | { id: 'camera'; kind: 'camera' }
  | { id: string; kind: 'asset'; asset: MediaAsset };

interface PreviewSession {
  mode: PreviewMode;
  initialAssetId: string;
}

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

function albumKey(album: MediaAlbum | null): string {
  return album?.id ?? '__all_media__';
}

function albumItemType(album: MediaAlbum | null): string {
  return album ? 'album' : 'all-media';
}

function gridItemType(item: PickerGridItem): PickerGridItem['kind'] {
  return item.kind;
}

function isInvalidCursorError(error: unknown): boolean {
  return (
    error instanceof NitroImagePickerError && error.code === 'E_INVALID_CURSOR'
  );
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
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
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
      ...DARK_THEME,
      ...themeOverrides,
    }),
    [themeOverrides],
  );
  const labels = useMemo<ResolvedMediaPickerLabels>(
    () => ({ ...DEFAULT_LABELS, ...labelOverrides }),
    [labelOverrides],
  );
  const albumTheme = useMemo<MediaPickerTheme>(
    () => ({
      ...DARK_THEME,
      background: '#2c2c2e',
      surface: '#3a3a3c',
      accent: theme.accent,
    }),
    [theme.accent],
  );

  const [permission, setPermission] = useState<MediaPermissionResponse>();
  const [albums, setAlbums] = useState<MediaAlbum[]>([]);
  const [activeAlbum, setActiveAlbum] = useState<MediaAlbum>();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [selectedLibraryAssets, setSelectedLibraryAssets] = useState<
    Record<string, MediaAsset>
  >({});
  const [endCursor, setEndCursor] = useState<string>();
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [containerWidth, setContainerWidth] = useState(0);
  const [albumsVisible, setAlbumsVisible] = useState(false);
  const [cameraMenuVisible, setCameraMenuVisible] = useState(false);
  const [previewSession, setPreviewSession] = useState<PreviewSession>();
  const [selection, dispatchSelection] = useReducer(
    selectionReducer,
    initialSelectedAssetIds,
    createSelectionState,
  );
  const requestSerial = useRef(0);
  const libraryGeneration = useRef(0);
  const loadingMoreRef = useRef(false);
  const onCancelRef = useLatestRef(onCancel);
  const onCompleteRef = useLatestRef(onComplete);
  const onErrorRef = useLatestRef(onError);

  const reportError = useCallback(
    (error: unknown) => {
      const normalized =
        error instanceof NitroImagePickerError
          ? error
          : new NitroImagePickerError('E_UNKNOWN', errorMessage(error), {
              cause: error,
            });
      setMessage(normalized.message);
      onErrorRef.current?.(normalized);
    },
    [onErrorRef],
  );

  const loadLibrary = useCallback(
    async (album?: MediaAlbum, showLoading = true) => {
      const serial = ++requestSerial.current;
      const generation = ++libraryGeneration.current;
      loadingMoreRef.current = false;
      if (showLoading) {
        setLoading(true);
        setMessage(undefined);
      }
      try {
        const [nextAlbums, page] = await Promise.all([
          getAlbumsAsync({ mediaTypes, includeSmartAlbums: true }),
          getAssetsAsync({
            albumId: album?.id,
            mediaTypes,
            first: DEFAULT_PAGE_SIZE,
          }),
        ]);
        if (
          requestSerial.current !== serial ||
          libraryGeneration.current !== generation
        )
          return;
        setAlbums((current) =>
          reconcileOrderedItems(current, nextAlbums, (item) => item.id),
        );
        setAssets((current) =>
          reconcileOrderedItems(current, page.assets, (item) => item.assetId),
        );
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
    let active = true;
    let inFlight = false;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const drainRefresh = async () => {
      if (inFlight) {
        pending = true;
        return;
      }
      inFlight = true;
      do {
        pending = false;
        await loadLibrary(activeAlbum, false);
      } while (active && pending);
      inFlight = false;
    };
    const subscription = addMediaLibraryChangeListener(() => {
      // 变更通知到达后旧游标已经失效，先阻止列表继续触底分页。
      libraryGeneration.current += 1;
      loadingMoreRef.current = false;
      setEndCursor(undefined);
      setHasNextPage(false);
      pending = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        if (active) void drainRefresh();
      }, LIBRARY_CHANGE_DEBOUNCE_MS);
    });
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
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
    if (
      !hasNextPage ||
      !endCursor ||
      loadingMoreRef.current ||
      loadingMore ||
      loading
    )
      return;
    const generation = libraryGeneration.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await getAssetsAsync({
        albumId: activeAlbum?.id,
        mediaTypes,
        first: DEFAULT_PAGE_SIZE,
        after: endCursor,
      });
      if (libraryGeneration.current !== generation) return;
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
      if (libraryGeneration.current !== generation) return;
      if (isInvalidCursorError(error)) {
        await loadLibrary(activeAlbum, false);
      } else {
        reportError(error);
      }
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [
    activeAlbum,
    endCursor,
    hasNextPage,
    loading,
    loadingMore,
    loadLibrary,
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

  const albumItems = useMemo<(MediaAlbum | null)[]>(
    () => [null, ...albums],
    [albums],
  );
  const renderAlbum = useCallback(
    ({ item }: ListRenderItemInfo<MediaAlbum | null>) => (
      <AlbumPickerRow
        album={item}
        allMediaCountLabel={`${assets.length}${hasNextPage ? '+' : ''}`}
        coverAssetId={item ? item.coverAssetId : assets[0]?.assetId}
        labels={labels}
        onChoose={chooseAlbum}
        selected={item ? activeAlbum?.id === item.id : !activeAlbum}
        shouldDownloadFromNetwork={shouldDownloadFromNetwork}
        theme={albumTheme}
      />
    ),
    [
      activeAlbum,
      albumTheme,
      assets,
      chooseAlbum,
      hasNextPage,
      labels,
      shouldDownloadFromNetwork,
    ],
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
          await loadLibrary(activeAlbum, false);
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
      onCompleteRef.current({ canceled: false, assets: completedAssets });
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }, [busy, onCompleteRef, reportError, selection, shouldDownloadFromNetwork]);

  const renderContext = useMemo(
    () => ({
      selectedCount: selection.selectedIds.length,
      selectionLimit: normalizedUi.selectionLimit,
      busy,
    }),
    [busy, normalizedUi.selectionLimit, selection.selectedIds.length],
  );

  const measuredCellSize = calculateGridCellSize(
    containerWidth || undefined,
    normalizedUi.columns,
    GRID_PADDING,
    GRID_GAP,
  );
  const cellSize = measuredCellSize ?? 1;

  const handleContainerLayout = useCallback((width: number) => {
    const measuredWidth = normalizeMeasuredWidth(width);
    if (!measuredWidth) return;
    setContainerWidth((current) =>
      current === measuredWidth ? current : measuredWidth,
    );
  }, []);

  const handleCancel = useCallback(() => {
    onCancelRef.current?.();
  }, [onCancelRef]);

  const closePreview = useCallback(() => setPreviewSession(undefined), []);
  const dismissMessage = useCallback(() => setMessage(undefined), []);

  const gridItems = useMemo<PickerGridItem[]>(
    () => [
      ...(allowCamera ? ([{ id: 'camera', kind: 'camera' }] as const) : []),
      ...assets.map(
        (asset): PickerGridItem => ({
          id: asset.assetId,
          kind: 'asset',
          asset,
        }),
      ),
    ],
    [allowCamera, assets],
  );

  const selectedPreviewItems = useMemo(
    () =>
      createSelectedPreviewItems(
        Object.values(selectedLibraryAssets),
        selection.selectedIds,
        selection.capturedAssets,
      ),
    [selectedLibraryAssets, selection.capturedAssets, selection.selectedIds],
  );
  const selectedPreviewInitialId = selectedPreviewItems.at(-1)?.id;

  useEffect(() => {
    setSelectedLibraryAssets((current) => {
      const selectedIds = new Set(selection.selectedIds);
      const next = Object.fromEntries(
        Object.entries(current).filter(([assetId]) => selectedIds.has(assetId)),
      );
      for (const asset of assets) {
        if (selectedIds.has(asset.assetId)) next[asset.assetId] = asset;
      }
      const currentKeys = Object.keys(current);
      const nextKeys = Object.keys(next);
      const changed =
        currentKeys.length !== nextKeys.length ||
        nextKeys.some((assetId) => current[assetId] !== next[assetId]);
      return changed ? next : current;
    });
  }, [assets, selection.selectedIds]);

  const toggleAssetSelection = useCallback(
    (assetId: string) => {
      const selected = selection.selectedIds.includes(assetId);
      if (
        !selected &&
        selection.selectedIds.length >= normalizedUi.selectionLimit
      ) {
        setMessage(labels.selectionLimitReached);
        return;
      }
      setMessage(undefined);
      dispatchSelection({
        type: 'toggle',
        assetId,
        limit: normalizedUi.selectionLimit,
      });
    },
    [
      labels.selectionLimitReached,
      normalizedUi.selectionLimit,
      selection.selectedIds,
    ],
  );

  const renderGridItem = useCallback(
    ({ item }: ListRenderItemInfo<PickerGridItem>) => {
      if (item.kind === 'camera') {
        return (
          <View style={[styles.gridCellFrame, { height: cellSize + GRID_GAP }]}>
            <View
              style={[
                styles.gridCell,
                styles.cameraTile,
                {
                  backgroundColor: theme.surface,
                  height: cellSize,
                  width: cellSize,
                },
              ]}
            >
              <View style={styles.cameraIcon}>
                <View style={styles.cameraLens} />
                <View style={styles.cameraTop} />
              </View>
              <Text style={[styles.cameraText, { color: theme.text }]}>
                {labels.takePhoto}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={
                mediaTypes.length > 1
                  ? `${labels.takePhoto} / ${labels.recordVideo}`
                  : mediaTypes[0] === 'videos'
                    ? labels.recordVideo
                    : labels.takePhoto
              }
              accessibilityRole="button"
              disabled={busy}
              onPress={openCamera}
              style={styles.gridCellTouchTarget}
            />
          </View>
        );
      }

      const asset = item.asset;
      const selectedIndex = getSelectionIndex(selection, asset.assetId);
      const toggleSelection = () => toggleAssetSelection(asset.assetId);
      const overlayContext: MediaPickerAssetRenderContext = {
        ...renderContext,
        asset,
        selectedIndex,
        toggleSelection,
        openPreview: () =>
          setPreviewSession({
            mode: 'album',
            initialAssetId: asset.assetId,
          }),
      };
      return (
        <View style={[styles.gridCellFrame, { height: cellSize + GRID_GAP }]}>
          <View
            style={[styles.gridCell, { height: cellSize, width: cellSize }]}
          >
            <MediaThumbnail
              assetId={asset.assetId}
              shouldDownloadFromNetwork={shouldDownloadFromNetwork}
              style={{ height: cellSize, width: cellSize }}
            />
          </View>
          <Pressable
            accessibilityLabel={`${labels.preview} ${asset.fileName ?? ''}`.trim()}
            accessibilityRole="button"
            onPress={overlayContext.openPreview}
            style={styles.gridCellTouchTarget}
          />
          {asset.type === 'video' ? (
            <Text style={[styles.duration, { color: '#ffffff' }]}>
              {formatDuration(asset.duration)}
            </Text>
          ) : null}
          {renderAssetOverlay ? (
            renderAssetOverlay(overlayContext)
          ) : (
            <Pressable
              accessibilityLabel={
                selectedIndex
                  ? `${labels.selected} ${selectedIndex}`
                  : labels.select
              }
              accessibilityRole="checkbox"
              accessibilityState={{ checked: Boolean(selectedIndex) }}
              onPress={toggleSelection}
              style={[
                styles.selectionBadge,
                {
                  backgroundColor: selectedIndex
                    ? theme.accent
                    : theme.overlay,
                  borderColor: '#ffffff',
                },
              ]}
            >
              <Text style={styles.selectionText}>{selectedIndex || ''}</Text>
            </Pressable>
          )}
        </View>
      );
    },
    [
      cellSize,
      busy,
      labels.preview,
      labels.recordVideo,
      labels.select,
      labels.selected,
      labels.takePhoto,
      mediaTypes,
      openCamera,
      renderAssetOverlay,
      renderContext,
      selection,
      shouldDownloadFromNetwork,
      toggleAssetSelection,
      theme.accent,
      theme.overlay,
      theme.surface,
      theme.text,
    ],
  );

  const defaultHeader = (
    <View
      style={[
        styles.header,
        { backgroundColor: PICKER_CHROME_COLOR },
      ]}
    >
      {onCancel ? (
        <Pressable
          accessibilityLabel={labels.cancel}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          hitSlop={8}
          onPress={handleCancel}
          style={[
            styles.closeButton,
            busy ? styles.disabled : undefined,
          ]}
        >
          <Text style={[styles.closeIcon, { color: theme.text }]}>×</Text>
        </Pressable>
      ) : (
        <View style={styles.headerSpacer} />
      )}
      <Pressable
        accessibilityLabel={`${labels.albums}，${activeAlbum?.title ?? labels.allMedia}`}
        accessibilityRole="button"
        onPress={() => setAlbumsVisible(true)}
        style={[styles.albumButton, { backgroundColor: PICKER_PILL_COLOR }]}
      >
        <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
          {activeAlbum?.title ?? labels.allMedia}
        </Text>
        <View style={styles.chevronCircle}>
          <View
            style={[
              styles.chevron,
              { borderColor: theme.text },
              albumsVisible ? styles.chevronExpanded : undefined,
            ]}
          />
        </View>
      </Pressable>
      <View style={styles.headerSpacer} />
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
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={
            permission.canAskAgain
              ? () => void requestAccess()
              : () => void Linking.openSettings()
          }
          style={[
            styles.primaryButton,
            { backgroundColor: theme.accent },
            busy ? styles.disabled : undefined,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.doneText}>
              {permission.canAskAgain ? labels.grantAccess : labels.openSettings}
            </Text>
          )}
        </Pressable>
      </View>
    );
  };

  const albumSheetTop = insets.top + PICKER_HEADER_HEIGHT;
  const albumSheetHeight = Math.min(
    albumItems.length * ALBUM_ROW_HEIGHT,
    Math.max(
      ALBUM_ROW_HEIGHT,
      windowHeight - albumSheetTop - ALBUM_SHEET_BOTTOM_GAP,
    ),
  );

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.root, { backgroundColor: PICKER_CHROME_COLOR }, style]}
    >
      {renderHeader ? renderHeader(renderContext) : defaultHeader}
      {message ? (
        <Pressable
          accessibilityLabel={`${labels.dismissMessage}：${message}`}
          accessibilityRole="button"
          onPress={dismissMessage}
          style={[
            styles.messageRow,
            {
              backgroundColor: theme.surface,
              borderLeftColor: theme.danger,
            },
          ]}
        >
          <Text
            selectable
            style={[styles.messageText, { color: theme.danger }]}
          >
            {message}
          </Text>
        </Pressable>
      ) : null}
      {!permission?.granted ? (
        <View style={styles.flexCenter}>{renderPermission()}</View>
      ) : (
        <View style={[styles.pickerBody, { backgroundColor: theme.background }]}>
          <View
            onLayout={(event) =>
              handleContainerLayout(event.nativeEvent.layout.width)
            }
            style={styles.listContainer}
          >
            {permission.accessPrivileges === 'limited' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => void manageLimitedAccess()}
                style={[
                  styles.limitedButton,
                  { backgroundColor: theme.surface },
                  busy ? styles.disabled : undefined,
                ]}
              >
                <Text style={{ color: theme.accent }}>
                  {labels.manageAccess}
                </Text>
              </Pressable>
            ) : null}
            {loading || !measuredCellSize ? (
              <View style={styles.flexCenter}>
                <ActivityIndicator color={theme.accent as string} />
              </View>
            ) : (
              <FlashList
                contentContainerStyle={
                  gridItems.length ? styles.gridList : styles.emptyList
                }
                data={gridItems}
                extraData={selection.selectedIds}
                getItemType={gridItemType}
                key={`${normalizedUi.columns}:${measuredCellSize}`}
                keyExtractor={(item) => item.id}
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
                    <View style={styles.loadingFooter}>
                      <ActivityIndicator color={theme.accent as string} />
                    </View>
                  ) : null
                }
                numColumns={normalizedUi.columns}
                onEndReached={() => void loadMore()}
                onEndReachedThreshold={0.5}
                renderItem={renderGridItem}
              />
            )}
          </View>

          <View
            style={[
              styles.bottomBar,
              {
                backgroundColor: PICKER_FOOTER_COLOR,
                borderTopColor: theme.separator,
                paddingBottom: Math.max(8, insets.bottom),
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled: !selectedPreviewInitialId || busy,
              }}
              disabled={!selectedPreviewInitialId || busy}
              onPress={() =>
                selectedPreviewInitialId
                  ? setPreviewSession({
                      mode: 'selected',
                      initialAssetId: selectedPreviewInitialId,
                    })
                  : undefined
              }
              style={[
                styles.previewButton,
                !selectedPreviewInitialId || busy ? styles.disabled : undefined,
              ]}
            >
              <Text
                style={{
                  color: selectedPreviewInitialId
                    ? theme.text
                    : theme.secondaryText,
                }}
              >
                {labels.preview}
              </Text>
            </Pressable>
            <View accessibilityRole="text" style={styles.originalStatus}>
              <View
                style={[styles.originalIndicator, { borderColor: theme.text }]}
              />
              <Text style={[styles.originalText, { color: theme.text }]}>
                {labels.original}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled: busy || selection.selectedIds.length === 0,
              }}
              disabled={busy || selection.selectedIds.length === 0}
              onPress={() => void confirm()}
              style={[
                styles.doneButton,
                {
                  backgroundColor:
                    selection.selectedIds.length > 0
                      ? theme.accent
                      : theme.surface,
                },
                busy || selection.selectedIds.length === 0
                  ? styles.disabled
                  : undefined,
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text
                  style={[
                    styles.doneText,
                    {
                      color:
                        selection.selectedIds.length > 0
                          ? '#ffffff'
                          : theme.secondaryText,
                    },
                  ]}
                >
                  {labels.done}
                  {selection.selectedIds.length
                    ? ` (${selection.selectedIds.length})`
                    : ''}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      )}

      <Modal
        animationType="fade"
        navigationBarTranslucent
        onRequestClose={() => setAlbumsVisible(false)}
        statusBarTranslucent
        transparent
        visible={albumsVisible}
      >
        <View style={styles.albumModalBackdrop}>
          <Pressable
            accessibilityLabel={labels.cancel}
            accessibilityRole="button"
            onPress={() => setAlbumsVisible(false)}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.albumModalHeader,
              {
                backgroundColor: PICKER_CHROME_COLOR,
                height: albumSheetTop,
                paddingTop: insets.top,
              },
            ]}
          >
            {onCancel ? (
              <Pressable
                accessibilityLabel={labels.cancel}
                accessibilityRole="button"
                onPress={() => {
                  setAlbumsVisible(false);
                  handleCancel();
                }}
                style={styles.closeButton}
              >
                <Text style={[styles.closeIcon, { color: theme.text }]}>×</Text>
              </Pressable>
            ) : (
              <View style={styles.headerSpacer} />
            )}
            <Pressable
              accessibilityLabel={labels.cancel}
              accessibilityRole="button"
              onPress={() => setAlbumsVisible(false)}
              style={[styles.albumButton, { backgroundColor: PICKER_PILL_COLOR }]}
            >
              <Text
                numberOfLines={1}
                style={[styles.title, { color: theme.text }]}
              >
                {activeAlbum?.title ?? labels.allMedia}
              </Text>
              <View style={styles.chevronCircle}>
                <View
                  style={[
                    styles.chevron,
                    styles.chevronExpanded,
                    { borderColor: theme.text },
                  ]}
                />
              </View>
            </Pressable>
            <View style={styles.headerSpacer} />
          </View>
          <View
            accessibilityViewIsModal
            style={[
              styles.albumSheet,
              {
                backgroundColor: albumTheme.background,
                height: albumSheetHeight,
                top: albumSheetTop,
              },
            ]}
          >
            <FlashList
              contentContainerStyle={styles.albumList}
              data={albumItems}
              getItemType={albumItemType}
              keyExtractor={albumKey}
              renderItem={renderAlbum}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        navigationBarTranslucent
        onRequestClose={() => setCameraMenuVisible(false)}
        statusBarTranslucent
        transparent
        visible={cameraMenuVisible}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityLabel={labels.cancel}
            onPress={() => setCameraMenuVisible(false)}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView
            edges={['bottom']}
            style={[
              styles.cameraSheet,
              { backgroundColor: albumTheme.background },
            ]}
          >
            <View style={styles.cameraSheetHandle} />
            <Pressable
              accessibilityLabel={labels.takePhoto}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => void capture('image')}
              style={[
                styles.menuCommand,
                styles.menuCommandSeparated,
                { borderBottomColor: albumTheme.separator },
                busy ? styles.disabled : undefined,
              ]}
            >
              <Text style={[styles.menuText, { color: albumTheme.text }]}>
                {labels.takePhoto}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={labels.recordVideo}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => void capture('video')}
              style={[
                styles.menuCommand,
                busy ? styles.disabled : undefined,
              ]}
            >
              <Text style={[styles.menuText, { color: albumTheme.text }]}>
                {labels.recordVideo}
              </Text>
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>

      {previewSession ? (
        <MediaPreviewModal
          assets={assets}
          busy={busy}
          capturedAssets={selection.capturedAssets}
          hasNextPage={hasNextPage}
          initialAssetId={previewSession.initialAssetId}
          key={`${previewSession.mode}:${previewSession.initialAssetId}`}
          labels={labels}
          message={message}
          mode={previewSession.mode}
          onClose={closePreview}
          onConfirm={() => void confirm()}
          onEndReached={() => void loadMore()}
          onDismissMessage={dismissMessage}
          onToggleSelection={toggleAssetSelection}
          selectedIds={selection.selectedIds}
          selectedLibraryAssets={Object.values(selectedLibraryAssets)}
          selectionLimit={normalizedUi.selectionLimit}
          shouldDownloadFromNetwork={shouldDownloadFromNetwork}
          theme={theme}
          visible
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: PICKER_HEADER_HEIGHT,
    paddingHorizontal: 12,
  },
  closeButton: {
    alignItems: 'center',
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  closeIcon: { fontSize: 34, fontWeight: '300', lineHeight: 38 },
  headerSpacer: { width: 52 },
  albumButton: {
    alignItems: 'center',
    borderRadius: 22,
    flexDirection: 'row',
    flexShrink: 1,
    gap: 9,
    justifyContent: 'center',
    maxWidth: '62%',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  title: { flexShrink: 1, fontSize: 16, fontWeight: '600' },
  chevronCircle: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  chevron: {
    borderBottomWidth: 2,
    borderRightWidth: 2,
    height: 7,
    marginTop: -3,
    transform: [{ rotate: '45deg' }],
    width: 7,
  },
  chevronExpanded: {
    marginBottom: -4,
    marginTop: 0,
    transform: [{ rotate: '225deg' }],
  },
  doneButton: {
    alignItems: 'center',
    borderRadius: 6,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 88,
    paddingHorizontal: 14,
  },
  doneText: { color: '#ffffff', fontWeight: '600' },
  messageRow: {
    alignItems: 'center',
    borderLeftWidth: 3,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  messageText: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  pickerBody: { flex: 1 },
  listContainer: { flex: 1 },
  flexCenter: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  centered: { alignItems: 'center', gap: 14, maxWidth: 320, padding: 24 },
  permissionTitle: { fontSize: 20, fontWeight: '600' },
  permissionDescription: { lineHeight: 21, textAlign: 'center' },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 6,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 120,
    paddingHorizontal: 18,
  },
  limitedButton: {
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  gridList: {
    paddingBottom: GRID_PADDING,
    paddingHorizontal: GRID_PADDING,
    paddingTop: GRID_PADDING,
  },
  gridCell: {
    overflow: 'hidden',
  },
  gridCellFrame: { padding: GRID_GAP / 2, width: '100%' },
  gridCellTouchTarget: {
    bottom: GRID_GAP / 2,
    left: GRID_GAP / 2,
    position: 'absolute',
    right: GRID_GAP / 2,
    top: GRID_GAP / 2,
  },
  cameraTile: {
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
  },
  cameraIcon: {
    borderColor: '#ffffff',
    borderRadius: 4,
    borderWidth: 3,
    height: 30,
    position: 'relative',
    width: 42,
  },
  cameraLens: {
    borderColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 3,
    height: 16,
    left: 10,
    position: 'absolute',
    top: 4,
    width: 16,
  },
  cameraTop: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    height: 5,
    left: 6,
    position: 'absolute',
    top: -7,
    width: 14,
  },
  cameraText: { fontSize: 14, fontWeight: '600' },
  emptyList: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    padding: GRID_PADDING,
  },
  loadingFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
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
    backgroundColor: 'rgba(0,0,0,0.48)',
    borderRadius: 3,
    bottom: 5,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    paddingHorizontal: 4,
    paddingVertical: 2,
    position: 'absolute',
    right: 5,
  },
  bottomBar: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  previewButton: {
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 54,
  },
  originalStatus: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
  },
  originalIndicator: {
    borderRadius: 13,
    borderWidth: 1.5,
    height: 26,
    width: 26,
  },
  originalText: { fontSize: 16 },
  disabled: { opacity: 0.52 },
  modalBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  albumModalBackdrop: { backgroundColor: 'rgba(0,0,0,0.72)', flex: 1 },
  albumModalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    paddingHorizontal: 12,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
  },
  cameraSheet: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    overflow: 'hidden',
    paddingTop: 8,
  },
  albumSheet: {
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    zIndex: 2,
  },
  cameraSheetHandle: {
    alignSelf: 'center',
    backgroundColor: '#c7c7cc',
    borderRadius: 2,
    height: 4,
    marginBottom: 6,
    width: 36,
  },
  albumList: { paddingBottom: 0 },
  menuCommand: {
    alignItems: 'center',
    minHeight: 58,
    justifyContent: 'center',
  },
  menuCommandSeparated: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuText: { fontSize: 18, fontWeight: '500' },
});
