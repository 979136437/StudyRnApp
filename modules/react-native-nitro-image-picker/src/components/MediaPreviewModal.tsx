import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  createAlbumPreviewItems,
  createSelectedPreviewItems,
  findPreviewIndex,
  nextPreviewIdAfterRemoval,
  type PreviewMediaItem,
  type PreviewMode,
} from '../core/preview';
import type { SelectionAsset } from '../core/selection';
import type {
  MediaAsset,
  MediaPickerTheme,
} from '../types';
import type { ResolvedMediaPickerLabels } from './constants';
import { MediaThumbnail } from './MediaThumbnail';
import { ZoomableMediaPreview } from './ZoomableMediaPreview';

interface MediaPreviewModalProps {
  assets: MediaAsset[];
  busy: boolean;
  capturedAssets: Record<string, SelectionAsset>;
  hasNextPage: boolean;
  initialAssetId?: string;
  labels: ResolvedMediaPickerLabels;
  message?: string;
  mode: PreviewMode;
  selectedIds: string[];
  selectedLibraryAssets: MediaAsset[];
  selectionLimit: number;
  shouldDownloadFromNetwork: boolean;
  theme: MediaPickerTheme;
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onEndReached: () => void;
  onDismissMessage: () => void;
  onToggleSelection: (assetId: string) => void;
}

export function MediaPreviewModal({
  assets,
  busy,
  capturedAssets,
  hasNextPage,
  initialAssetId,
  labels,
  message,
  mode,
  onClose,
  onConfirm,
  onEndReached,
  onDismissMessage,
  onToggleSelection,
  selectedIds,
  selectedLibraryAssets,
  selectionLimit,
  shouldDownloadFromNetwork,
  theme,
  visible,
}: MediaPreviewModalProps): React.JSX.Element {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<ScrollView>(null);
  const [currentId, setCurrentId] = useState(initialAssetId);
  const [zoomActive, setZoomActive] = useState(false);

  const albumItems = useMemo(() => createAlbumPreviewItems(assets), [assets]);
  const selectedItems = useMemo(
    () =>
      createSelectedPreviewItems(
        selectedLibraryAssets,
        selectedIds,
        capturedAssets,
      ),
    [capturedAssets, selectedIds, selectedLibraryAssets],
  );
  const items = mode === 'selected' ? selectedItems : albumItems;
  const currentIndex = findPreviewIndex(items, currentId ?? initialAssetId);
  const currentItem = currentIndex >= 0 ? items[currentIndex] : undefined;
  const selectedIndex = currentItem
    ? selectedIds.indexOf(currentItem.id) + 1
    : 0;
  const sessionKey = `${mode}:${initialAssetId ?? ''}`;
  const headerHeight = insets.top + 56;
  const footerHeight =
    Math.max(insets.bottom, 8) + 58 + (selectedItems.length ? 60 : 0);
  const visiblePageWindow = useMemo(() => {
    const anchorIndex = Math.max(0, currentIndex);
    const startIndex = Math.max(0, anchorIndex - 1);
    const endIndex = Math.min(items.length, anchorIndex + 2);
    return {
      endIndex,
      items: items.slice(startIndex, endIndex),
      startIndex,
    };
  }, [currentIndex, items]);

  useEffect(() => {
    if (!visible) return;
    if (!items.length) {
      onClose();
      return;
    }
    if (currentId && items.some((item) => item.id === currentId)) return;
    setCurrentId(items[Math.max(0, Math.min(currentIndex, items.length - 1))]?.id);
  }, [currentId, currentIndex, items, onClose, visible]);

  useEffect(() => {
    if (!visible || currentIndex < 0) return;
    pagerRef.current?.scrollTo({
      animated: false,
      x: currentIndex * width,
      y: 0,
    });
  }, [currentIndex, sessionKey, visible, width]);

  const toggleCurrent = useCallback(() => {
    if (!currentItem) return;
    if (selectedIndex > 0 && mode === 'selected') {
      const nextId = nextPreviewIdAfterRemoval(items, currentItem.id);
      onToggleSelection(currentItem.id);
      if (!nextId) {
        onClose();
        return;
      }
      setCurrentId(nextId);
      return;
    }
    onToggleSelection(currentItem.id);
  }, [currentItem, items, mode, onClose, onToggleSelection, selectedIndex]);

  const jumpToItem = useCallback(
    (item: PreviewMediaItem) => {
      const index = items.findIndex((candidate) => candidate.id === item.id);
      if (index < 0) return;
      setZoomActive(false);
      setCurrentId(item.id);
      pagerRef.current?.scrollTo({ animated: true, x: index * width, y: 0 });
    },
    [items, width],
  );

  const renderPage = useCallback(
    (item: PreviewMediaItem) => (
      <View key={item.id} style={[styles.page, { width }]}>
        <ZoomableMediaPreview
          active={item.id === currentItem?.id}
          item={item}
          onZoomActiveChange={setZoomActive}
          shouldDownloadFromNetwork={shouldDownloadFromNetwork}
          videoLabel={labels.video}
        />
      </View>
    ),
    [currentItem?.id, labels.video, shouldDownloadFromNetwork, width],
  );

  const renderSelectedThumbnail = useCallback(
    (item: PreviewMediaItem, index: number) => {
      const availableInPager = items.some((candidate) => candidate.id === item.id);
      const activeItem = currentItem?.id === item.id;
      return (
        <Pressable
          accessibilityLabel={`${labels.preview} ${index + 1}`}
          accessibilityRole="button"
          accessibilityState={{ selected: activeItem }}
          disabled={!availableInPager}
          onPress={() => jumpToItem(item)}
          style={[
            styles.thumbnail,
            activeItem
              ? { borderColor: theme.accent }
              : styles.thumbnailInactive,
            !availableInPager ? styles.disabled : undefined,
          ]}
        >
          {item.assetId ? (
            <MediaThumbnail
              assetId={item.assetId}
              shouldDownloadFromNetwork={shouldDownloadFromNetwork}
              style={StyleSheet.absoluteFill}
            />
          ) : item.type === 'image' && item.uri ? (
            <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={styles.videoThumbnail}>
              <Text style={styles.videoThumbnailText}>{labels.video}</Text>
            </View>
          )}
          <View
            style={[styles.thumbnailIndex, { backgroundColor: theme.accent }]}
          >
            <Text style={styles.thumbnailIndexText}>{index + 1}</Text>
          </View>
        </Pressable>
      );
    },
    [
      currentItem?.id,
      items,
      jumpToItem,
      labels.preview,
      labels.video,
      shouldDownloadFromNetwork,
      theme.accent,
    ],
  );

  return (
    <Modal
      animationType="none"
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      visible={visible}
    >
      <View accessibilityViewIsModal style={styles.root}>
        <View
          style={[
            styles.header,
            { height: headerHeight, paddingTop: insets.top },
          ]}
        >
          <Pressable
            accessibilityLabel={labels.closePreview}
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClose}
            style={styles.headerButton}
          >
            <View style={styles.backIcon} />
          </Pressable>
          <View style={styles.headerPosition} />
          <Pressable
            accessibilityLabel={
              selectedIndex
                ? `${labels.selected} ${selectedIndex}`
                : `${labels.select}，${selectionLimit}`
            }
            accessibilityRole="button"
            accessibilityState={{ disabled: !currentItem || busy }}
            disabled={!currentItem || busy}
            onPress={toggleCurrent}
            style={[
              styles.previewSelection,
              {
                borderColor: '#ffffff',
              },
              !currentItem || busy ? styles.disabled : undefined,
            ]}
          >
            <Text style={styles.previewSelectionText}>
              {selectedIndex ? '✓' : ''}
            </Text>
          </Pressable>
        </View>

        {message ? (
          <Pressable
            accessibilityLabel={`${labels.dismissMessage}：${message}`}
            accessibilityRole="button"
            onPress={onDismissMessage}
            style={[styles.messageBar, { top: headerHeight }]}
          >
            <Text
              selectable
              style={[styles.messageText, { color: theme.danger }]}
            >
              {message}
            </Text>
          </Pressable>
        ) : null}

        <View
          style={[
            styles.pager,
            { marginBottom: footerHeight, marginTop: headerHeight },
          ]}
        >
          {items.length ? (
            <ScrollView
              contentOffset={{ x: Math.max(0, currentIndex) * width, y: 0 }}
              decelerationRate="fast"
              disableIntervalMomentum
              horizontal
              key={sessionKey}
              onMomentumScrollEnd={(event) => {
                const nextIndex = Math.round(
                  event.nativeEvent.contentOffset.x / Math.max(1, width),
                );
                const nextItem = items[nextIndex];
                if (nextItem) {
                  setZoomActive(false);
                  setCurrentId(nextItem.id);
                  if (
                    mode === 'album' &&
                    hasNextPage &&
                    nextIndex >= items.length - 2
                  ) {
                    onEndReached();
                  }
                }
              }}
              pagingEnabled
              ref={pagerRef}
              scrollEnabled={!zoomActive}
              showsHorizontalScrollIndicator={false}
              snapToInterval={width}
              style={styles.pagerScroller}
            >
              {visiblePageWindow.startIndex > 0 ? (
                <View
                  style={{ width: visiblePageWindow.startIndex * width }}
                />
              ) : null}
              {visiblePageWindow.items.map(renderPage)}
              {visiblePageWindow.endIndex < items.length ? (
                <View
                  style={{
                    width: (items.length - visiblePageWindow.endIndex) * width,
                  }}
                />
              ) : null}
            </ScrollView>
          ) : null}
        </View>

        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, 8) },
            selectedItems.length ? styles.footerWithThumbnails : undefined,
          ]}
        >
          {selectedItems.length ? (
            <ScrollView
              contentContainerStyle={styles.thumbnailList}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.thumbnailScroller}
            >
              {selectedItems.map((item, index) => (
                <View key={item.id}>
                  {renderSelectedThumbnail(item, index)}
                </View>
              ))}
            </ScrollView>
          ) : null}
          <View style={styles.footerCommands}>
            <Text style={styles.selectionSummary}>
              {selectedIds.length}/{selectionLimit}
            </Text>
            <View accessibilityRole="text" style={styles.originalStatus}>
              <View style={styles.originalIndicator} />
              <Text style={styles.originalText}>{labels.original}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled: busy || selectedIds.length === 0,
              }}
              disabled={busy || selectedIds.length === 0}
              onPress={onConfirm}
              style={[
                styles.doneButton,
                {
                  backgroundColor:
                    selectedIds.length > 0 ? theme.accent : theme.surface,
                },
                busy || selectedIds.length === 0
                  ? styles.disabled
                  : undefined,
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.doneText}>
                  {labels.done} ({selectedIds.length})
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#000000', flex: 1 },
  header: {
    alignItems: 'center',
    backgroundColor: '#212123',
    flexDirection: 'row',
    left: 0,
    paddingHorizontal: 14,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10,
  },
  headerButton: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  backIcon: {
    borderBottomColor: '#ffffff',
    borderBottomWidth: 2,
    borderLeftColor: '#ffffff',
    borderLeftWidth: 2,
    height: 17,
    transform: [{ rotate: '45deg' }],
    width: 17,
  },
  headerPosition: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  previewSelection: {
    alignItems: 'center',
    borderRadius: 19,
    borderWidth: 1.5,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  previewSelectionText: {
    color: '#ffffff',
    fontSize: 18,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  pager: { backgroundColor: '#000000', flex: 1 },
  messageBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.16)',
    justifyContent: 'center',
    left: 0,
    minHeight: 38,
    paddingHorizontal: 16,
    position: 'absolute',
    right: 0,
    zIndex: 11,
  },
  messageText: { fontSize: 13, textAlign: 'center' },
  page: { backgroundColor: '#000000', height: '100%' },
  pagerScroller: { flex: 1 },
  footer: {
    backgroundColor: '#1c1c1e',
    bottom: 0,
    left: 0,
    paddingHorizontal: 16,
    position: 'absolute',
    right: 0,
    zIndex: 10,
  },
  footerWithThumbnails: { paddingTop: 8 },
  thumbnailScroller: { height: 52 },
  thumbnailList: { gap: 10 },
  thumbnail: {
    borderRadius: 5,
    borderWidth: 2,
    height: 50,
    overflow: 'hidden',
    width: 50,
  },
  thumbnailInactive: { borderColor: 'transparent' },
  videoThumbnail: {
    alignItems: 'center',
    backgroundColor: '#2c2c2e',
    flex: 1,
    justifyContent: 'center',
  },
  videoThumbnailText: { color: '#ffffff', fontSize: 11, fontWeight: '600' },
  thumbnailIndex: {
    alignItems: 'center',
    borderBottomLeftRadius: 4,
    height: 18,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    top: 0,
    width: 18,
  },
  thumbnailIndexText: {
    color: '#ffffff',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  footerCommands: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 58,
  },
  selectionSummary: {
    color: '#aeaeb2',
    flex: 1,
    fontVariant: ['tabular-nums'],
    textAlign: 'left',
  },
  originalStatus: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
  },
  originalIndicator: {
    borderColor: '#ffffff',
    borderRadius: 13,
    borderWidth: 1.5,
    height: 26,
    width: 26,
  },
  originalText: { color: '#ffffff', fontSize: 16 },
  doneButton: {
    alignItems: 'center',
    borderRadius: 6,
    justifyContent: 'center',
    minHeight: 42,
    minWidth: 86,
    paddingHorizontal: 14,
  },
  doneText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.52 },
});
