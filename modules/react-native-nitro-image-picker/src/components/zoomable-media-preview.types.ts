import type { PreviewMediaItem } from '../core/preview';

export interface ZoomableMediaPreviewProps {
  active: boolean;
  item: PreviewMediaItem;
  shouldDownloadFromNetwork: boolean;
  videoLabel: string;
  onZoomActiveChange: (active: boolean) => void;
}
