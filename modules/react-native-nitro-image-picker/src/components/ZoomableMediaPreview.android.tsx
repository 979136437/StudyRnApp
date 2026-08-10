import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
} from 'react-native';

import {
  MIN_PREVIEW_SCALE,
  clampPreviewScale,
  clampPreviewTranslation,
  previewTouchDistance,
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
  const scale = useRef(new Animated.Value(MIN_PREVIEW_SCALE)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scaleRef = useRef(MIN_PREVIEW_SCALE);
  const translationRef = useRef({ x: 0, y: 0 });
  const gestureStart = useRef({
    distance: 0,
    scale: MIN_PREVIEW_SCALE,
    x: 0,
    y: 0,
    dx: 0,
    dy: 0,
  });
  const [viewport, setViewport] = useState({ width: 1, height: 1 });

  const updateTransform = useCallback(
    (nextScale: number, nextX: number, nextY: number) => {
      const boundedScale = clampPreviewScale(nextScale);
      const boundedTranslation = clampPreviewTranslation(
        { x: nextX, y: nextY },
        viewport.width,
        viewport.height,
        boundedScale,
      );
      scaleRef.current = boundedScale;
      translationRef.current = boundedTranslation;
      scale.setValue(boundedScale);
      translateX.setValue(boundedTranslation.x);
      translateY.setValue(boundedTranslation.y);
      onZoomActiveChange(active && boundedScale > ZOOM_ACTIVE_THRESHOLD);
    },
    [
      active,
      onZoomActiveChange,
      scale,
      translateX,
      translateY,
      viewport.height,
      viewport.width,
    ],
  );

  const resetZoom = useCallback(() => {
    scaleRef.current = MIN_PREVIEW_SCALE;
    translationRef.current = { x: 0, y: 0 };
    Animated.parallel([
      Animated.spring(scale, {
        toValue: MIN_PREVIEW_SCALE,
        useNativeDriver: true,
      }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
    ]).start();
    onZoomActiveChange(false);
  }, [onZoomActiveChange, scale, translateX, translateY]);

  useEffect(() => {
    resetZoom();
  }, [item.id, resetZoom]);

  useEffect(() => {
    if (!active) resetZoom();
  }, [active, resetZoom]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (event) =>
          active &&
          (event.nativeEvent.touches.length >= 2 ||
            scaleRef.current > ZOOM_ACTIVE_THRESHOLD),
        onMoveShouldSetPanResponderCapture: (event) =>
          active &&
          (event.nativeEvent.touches.length >= 2 ||
            scaleRef.current > ZOOM_ACTIVE_THRESHOLD),
        onPanResponderGrant: (event, gestureState) => {
          const touches = event.nativeEvent.touches;
          gestureStart.current = {
            distance:
              touches.length >= 2
                ? previewTouchDistance(touches[0]!, touches[1]!)
                : 0,
            scale: scaleRef.current,
            x: translationRef.current.x,
            y: translationRef.current.y,
            dx: gestureState.dx,
            dy: gestureState.dy,
          };
        },
        onPanResponderMove: (event, gestureState) => {
          const touches = event.nativeEvent.touches;
          if (touches.length >= 2) {
            const distance = previewTouchDistance(touches[0]!, touches[1]!);
            if (gestureStart.current.distance <= 0) {
              gestureStart.current.distance = distance;
              gestureStart.current.scale = scaleRef.current;
              return;
            }
            updateTransform(
              gestureStart.current.scale *
                (distance / gestureStart.current.distance),
              translationRef.current.x,
              translationRef.current.y,
            );
            // 双指仍按下时持续锁定外层分页，避免缩回 1x 的瞬间被横向列表抢走手势。
            onZoomActiveChange(true);
            return;
          }
          if (scaleRef.current <= ZOOM_ACTIVE_THRESHOLD) return;
          if (gestureStart.current.distance > 0) {
            gestureStart.current = {
              distance: 0,
              scale: scaleRef.current,
              x: translationRef.current.x,
              y: translationRef.current.y,
              dx: gestureState.dx,
              dy: gestureState.dy,
            };
            return;
          }
          updateTransform(
            scaleRef.current,
            gestureStart.current.x + gestureState.dx - gestureStart.current.dx,
            gestureStart.current.y + gestureState.dy - gestureStart.current.dy,
          );
        },
        onPanResponderRelease: () => {
          if (scaleRef.current <= ZOOM_ACTIVE_THRESHOLD) resetZoom();
        },
        onPanResponderTerminate: resetZoom,
        onPanResponderTerminationRequest: () =>
          scaleRef.current <= ZOOM_ACTIVE_THRESHOLD,
      }),
    [active, onZoomActiveChange, resetZoom, updateTransform],
  );

  return (
    <View
      onLayout={(event) => {
        const { height, width } = event.nativeEvent.layout;
        setViewport({ height: Math.max(1, height), width: Math.max(1, width) });
      }}
      style={styles.root}
      {...panResponder.panHandlers}
    >
      <Animated.View
        style={[
          styles.media,
          {
            transform: [
              { translateX },
              { translateY },
              { scale },
            ],
          },
        ]}
      >
        <PreviewMedia
          item={item}
          shouldDownloadFromNetwork={shouldDownloadFromNetwork}
          videoLabel={videoLabel}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#000000', flex: 1, overflow: 'hidden' },
  media: { height: '100%', width: '100%' },
});
