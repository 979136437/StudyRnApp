import { useLayoutEffect, useMemo, useRef } from 'react';
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

export function MediaThumbnail({
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
    <NativeMediaThumbnail
      assetId={assetId}
      onError={handlers.onError}
      onLoad={handlers.onLoad}
      resizeMode={resizeMode}
      shouldDownloadFromNetwork={shouldDownloadFromNetwork}
      style={style}
    />
  );
}
