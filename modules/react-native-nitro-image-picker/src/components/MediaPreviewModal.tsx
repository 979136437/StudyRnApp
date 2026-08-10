import {
  FlashList,
  type FlashListRef,
  type ListRenderItemInfo,
} from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

function previewKey(item: PreviewMediaItem): string {
  return item.id;
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
  const pagerRef = useRef<FlashListRef<PreviewMediaItem>>(null);
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

  useEffect(() => {
    if (!visible) return;
    const initialIndex = findPreviewIndex(items, initialAssetId);
    setCurrentId(initialIndex >= 0 ? items[initialIndex]?.id : undefined);
    setZoomActive(false);
  }, [initialAssetId, sessionKey, visible]);

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
    void pagerRef.current
      ?.scrollToIndex({ animated: false, index: currentIndex })
      .catch(() => undefined);
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
      void pagerRef.current
        ?.scrollToIndex({ animated: true, index })
        .catch(() => undefined);
    },
    [items],
  );

  const renderPage = useCallback(
    ({ item }: ListRenderItemInfo<PreviewMediaItem>) => (
      <View style={[styles.page, { width }]}>
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
    ({ item, index }: ListRenderItemInfo<PreviewMediaItem>) => {
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
      animationType="fade"
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      visible={visible}
    >
      <SafeAreaView
        accessibilityViewIsModal
        edges={['top', 'bottom']}
        style={styles.root}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={labels.closePreview}
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClose}
            style={({ pressed }) => [
              styles.headerButton,
              pressed ? styles.pressed : undefined,
            ]}
          >
            <View style={styles.backIcon} />
          </Pressable>
          <View style={styles.headerPosition}>
            <Text style={styles.headerPositionText}>
              {currentIndex >= 0 ? currentIndex + 1 : 0}/{items.length}
            </Text>
          </View>
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
            style={({ pressed }) => [
              styles.previewSelection,
              {
                backgroundColor: selectedIndex ? theme.accent : 'transparent',
                borderColor: selectedIndex ? theme.accent : '#ffffff',
              },
              pressed ? styles.pressed : undefined,
              !currentItem || busy ? styles.disabled : undefined,
            ]}
          >
            <Text style={styles.previewSelectionText}>
              {selectedIndex || ''}
            </Text>
          </Pressable>
        </View>

        {message ? (
          <Pressable
            accessibilityLabel={`${labels.dismissMessage}：${message}`}
            accessibilityRole="button"
            onPress={onDismissMessage}
            style={styles.messageBar}
          >
            <Text
              selectable
              style={[styles.messageText, { color: theme.danger }]}
            >
              {message}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.pager}>
          {items.length ? (
            <FlashList
              data={items}
              decelerationRate="fast"
              disableIntervalMomentum
              horizontal
              initialScrollIndex={Math.max(0, currentIndex)}
              key={sessionKey}
              keyExtractor={previewKey}
              onEndReached={mode === 'album' && hasNextPage ? onEndReached : null}
              onEndReachedThreshold={0.5}
              onMomentumScrollEnd={(event) => {
                const nextIndex = Math.round(
                  event.nativeEvent.contentOffset.x / Math.max(1, width),
                );
                const nextItem = items[nextIndex];
                if (nextItem) {
                  setZoomActive(false);
                  setCurrentId(nextItem.id);
                }
              }}
              pagingEnabled
              ref={pagerRef}
              renderItem={renderPage}
              scrollEnabled={!zoomActive}
              showsHorizontalScrollIndicator={false}
              snapToInterval={width}
            />
          ) : null}
        </View>

        <View
          style={[
            styles.footer,
            selectedItems.length ? styles.footerWithThumbnails : undefined,
          ]}
        >
          {selectedItems.length ? (
            <FlashList
              contentContainerStyle={styles.thumbnailList}
              data={selectedItems}
              horizontal
              keyExtractor={previewKey}
              renderItem={renderSelectedThumbnail}
              showsHorizontalScrollIndicator={false}
              style={styles.thumbnailScroller}
            />
          ) : null}
          <View style={styles.footerCommands}>
            <Text style={styles.selectionSummary}>
              {selectedIds.length}/{selectionLimit}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled: busy || selectedIds.length === 0,
              }}
              disabled={busy || selectedIds.length === 0}
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.doneButton,
                {
                  backgroundColor:
                    selectedIds.length > 0 ? theme.accent : theme.surface,
                },
                pressed ? styles.pressed : undefined,
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
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#000000', flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 62,
    paddingHorizontal: 14,
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
  headerPositionText: {
    color: '#aeaeb2',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
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
    minHeight: 38,
    paddingHorizontal: 16,
  },
  messageText: { fontSize: 13, textAlign: 'center' },
  page: { backgroundColor: '#000000', flex: 1 },
  footer: {
    backgroundColor: '#1c1c1e',
    paddingHorizontal: 16,
  },
  footerWithThumbnails: { minHeight: 142, paddingTop: 12 },
  thumbnailScroller: { height: 62 },
  thumbnailList: { gap: 10 },
  thumbnail: {
    borderRadius: 5,
    borderWidth: 2,
    height: 58,
    overflow: 'hidden',
    width: 58,
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
    gap: 16,
    justifyContent: 'flex-end',
    minHeight: 68,
  },
  selectionSummary: {
    color: '#aeaeb2',
    flex: 1,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  doneButton: {
    alignItems: 'center',
    borderRadius: 6,
    justifyContent: 'center',
    minHeight: 42,
    minWidth: 104,
    paddingHorizontal: 14,
  },
  doneText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.52 },
});
