import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { callback, getHostComponent } from 'react-native-nitro-modules';

import MediaThumbnailConfig from '../../nitrogen/generated/shared/json/MediaThumbnailConfig.json';
import type {
  MediaThumbnailNativeProps,
  ThumbnailErrorEvent,
  ThumbnailLoadEvent,
} from '../specs/ImagePicker.nitro';
import type { MediaThumbnailProps } from '../types';

const NativeMediaThumbnail = getHostComponent<
  MediaThumbnailNativeProps,
  Record<string, never>
>('MediaThumbnail', () => MediaThumbnailConfig);

export const MediaThumbnail = memo(function MediaThumbnail({
  assetId,
  onError,
  onLoad,
  resizeMode = 'cover',
  shouldDownloadFromNetwork = true,
  style,
}: MediaThumbnailProps): React.JSX.Element {
  const handlersRef = useRef<{
    onError?: MediaThumbnailProps['onError'];
    onLoad?: MediaThumbnailProps['onLoad'];
  }>({ onError, onLoad });
  useLayoutEffect(() => {
    handlersRef.current = { onError, onLoad };
    return () => {
      handlersRef.current = {};
    };
  }, [onError, onLoad]);

  const handlers = useMemo(
    () => ({
      onLoad: callback((event: ThumbnailLoadEvent) =>
        handlersRef.current.onLoad?.(event),
      ),
      onError: callback((event: ThumbnailErrorEvent) =>
        handlersRef.current.onError?.(event),
      ),
    }),
    [],
  );

  return (
    <View collapsable={false} pointerEvents="none" style={style}>
      <NativeMediaThumbnail
        assetId={assetId}
        onError={handlers.onError}
        onLoad={handlers.onLoad}
        pointerEvents="none"
        resizeMode={resizeMode}
        shouldDownloadFromNetwork={shouldDownloadFromNetwork}
        // Nitro 视图使用明确百分比尺寸；四边绝对约束在回收列表中会退化为图片固有高度。
        style={styles.nativeView}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  nativeView: { height: '100%', width: '100%' },
});
