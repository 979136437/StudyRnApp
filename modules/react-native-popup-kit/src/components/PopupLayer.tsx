import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { PopupMode } from '../constants';
import type { InternalPopupController } from '../core/popup-controller';
import type { ResolvedPopupOptions } from '../types';
import { getPopupAlignment, getPopupSize } from './popup-layout';

interface PopupLayerProps {
  controller: InternalPopupController;
  closing: boolean;
  interactive: boolean;
  popup: ResolvedPopupOptions;
}

export function PopupLayer({
  controller,
  closing,
  interactive,
  popup,
}: PopupLayerProps): React.JSX.Element {
  const {
    children,
    closeOnClickOverlay,
    contentPointerEvents,
    duration,
    id,
    mode,
    onShown,
    overlay,
    overlayContent,
    overlayStyle,
    popupStyle,
    shareValue,
  } = popup;
  const completePopup = controller.store.complete;
  const internalProgress = useSharedValue(0);
  const shownRef = useRef(false);
  const progress = shareValue ?? internalProgress;
  const { height, width } = useWindowDimensions();

  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    try {
      onShown?.();
    } catch {
      // Consumer callbacks cannot interrupt popup rendering.
    }
  }, [onShown]);

  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
    progress.value = withTiming(1, {
      duration,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    });
    return () => {
      cancelAnimation(progress);
      progress.value = 0;
    };
  }, [duration, id, progress]);

  useEffect(() => {
    if (!closing) return;
    progress.value = withTiming(
      0,
      {
        duration,
        easing: Easing.in(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      },
      (finished) => {
        if (finished) scheduleOnRN(completePopup, id);
      },
    );
  }, [closing, completePopup, duration, id, progress]);

  const contentStyle = useAnimatedStyle(() => {
    const offset = 1 - progress.value;
    let translateX = 0;
    let translateY = 0;
    if (mode === PopupMode.TOP) translateY = -height * offset;
    if (mode === PopupMode.BOTTOM) translateY = height * offset;
    if (mode === PopupMode.LEFT) translateX = -width * offset;
    if (mode === PopupMode.RIGHT) translateX = width * offset;
    const isCenter = mode === PopupMode.CENTER;
    return {
      opacity: mode === PopupMode.FULLSCREEN || isCenter ? progress.value : 1,
      transform: [
        { translateX },
        { translateY },
        {
          scale: isCenter ? interpolate(progress.value, [0, 1], [0.94, 1]) : 1,
        },
      ],
    };
  }, [height, mode, width]);

  const overlayAnimatedStyle = useAnimatedStyle(
    () => ({
      opacity: overlay ? progress.value : 0,
    }),
    [overlay],
  );

  const requestClose = (): void => {
    void controller.hidePopup(id);
  };

  return (
    <View
      pointerEvents={interactive ? (overlay ? 'auto' : 'box-none') : 'none'}
      style={[styles.root, getPopupAlignment(mode)]}
    >
      {overlay ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.overlay,
            overlayStyle,
            overlayAnimatedStyle,
          ]}
        >
          {overlayContent === undefined ? null : (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              {overlayContent}
            </View>
          )}
          <Pressable
            accessibilityLabel="关闭弹窗"
            accessibilityRole="button"
            disabled={!closeOnClickOverlay}
            onPress={requestClose}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
      <Animated.View
        pointerEvents={contentPointerEvents}
        style={[styles.content, getPopupSize(mode), popupStyle, contentStyle]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { overflow: 'hidden' },
  overlay: { backgroundColor: 'rgba(0, 0, 0, 0.46)' },
  root: StyleSheet.absoluteFill,
});
