import { PreviewMedia } from './PreviewMedia';
import type { ZoomableMediaPreviewProps } from './zoomable-media-preview.types';

export function ZoomableMediaPreview({
  item,
  shouldDownloadFromNetwork,
  videoLabel,
}: ZoomableMediaPreviewProps): React.JSX.Element {
  return (
    <PreviewMedia
      item={item}
      shouldDownloadFromNetwork={shouldDownloadFromNetwork}
      videoLabel={videoLabel}
    />
  );
}
