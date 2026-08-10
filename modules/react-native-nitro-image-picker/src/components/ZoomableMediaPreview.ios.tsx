import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {
  MAX_PREVIEW_SCALE,
  MIN_PREVIEW_SCALE,
} from '../core/preview-zoom';
import { PreviewMedia } from './PreviewMedia';
import type { ZoomableMediaPreviewProps } from './zoomable-media-preview.types';

const ZOOM_ACTIVE_THRESHOLD = 1.01;

export function ZoomableMediaPreview({
  active,
  item,
  onZoomActiveChange,
  shouldDownloadFromNetwork,
  videoLabel,
}: ZoomableMediaPreviewProps): React.JSX.Element {
  const scrollRef = useRef<ScrollView>(null);
  const [viewport, setViewport] = useState({ width: 1, height: 1 });

  const resetZoom = useCallback(() => {
    scrollRef.current?.scrollResponderZoomTo({
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height,
      animated: false,
    });
    onZoomActiveChange(false);
  }, [onZoomActiveChange, viewport.height, viewport.width]);

  useEffect(() => {
    resetZoom();
  }, [item.id, resetZoom]);

  useEffect(() => {
    if (!active) resetZoom();
  }, [active, resetZoom]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const zoomScale = event.nativeEvent.zoomScale ?? MIN_PREVIEW_SCALE;
      onZoomActiveChange(active && zoomScale > ZOOM_ACTIVE_THRESHOLD);
    },
    [active, onZoomActiveChange],
  );

  return (
    <ScrollView
      bounces={false}
      bouncesZoom
      centerContent
      contentContainerStyle={styles.content}
      maximumZoomScale={MAX_PREVIEW_SCALE}
      minimumZoomScale={MIN_PREVIEW_SCALE}
      onLayout={(event) => {
        const { height, width } = event.nativeEvent.layout;
        setViewport({ height: Math.max(1, height), width: Math.max(1, width) });
      }}
      onScroll={handleScroll}
      ref={scrollRef}
      scrollEventThrottle={16}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      style={styles.root}
    >
      <View style={viewport}>
        <PreviewMedia
          item={item}
          shouldDownloadFromNetwork={shouldDownloadFromNetwork}
          videoLabel={videoLabel}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#000000', flex: 1 },
  content: { flexGrow: 1 },
});
