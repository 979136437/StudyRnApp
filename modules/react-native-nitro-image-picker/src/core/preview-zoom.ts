export const MIN_PREVIEW_SCALE = 1;
export const MAX_PREVIEW_SCALE = 4;

export interface PreviewTranslation {
  x: number;
  y: number;
}

export interface PreviewTouchPoint {
  pageX: number;
  pageY: number;
}

export function clampPreviewScale(scale: number): number {
  if (!Number.isFinite(scale)) return MIN_PREVIEW_SCALE;
  return Math.min(MAX_PREVIEW_SCALE, Math.max(MIN_PREVIEW_SCALE, scale));
}

export function previewPanBounds(
  width: number,
  height: number,
  scale: number,
): PreviewTranslation {
  const boundedScale = clampPreviewScale(scale);
  return {
    x: Math.max(0, (width * boundedScale - width) / 2),
    y: Math.max(0, (height * boundedScale - height) / 2),
  };
}

export function clampPreviewTranslation(
  translation: PreviewTranslation,
  width: number,
  height: number,
  scale: number,
): PreviewTranslation {
  const bounds = previewPanBounds(width, height, scale);
  return {
    x: Math.min(bounds.x, Math.max(-bounds.x, translation.x)),
    y: Math.min(bounds.y, Math.max(-bounds.y, translation.y)),
  };
}

export function previewTouchDistance(
  first: PreviewTouchPoint,
  second: PreviewTouchPoint,
): number {
  return Math.hypot(second.pageX - first.pageX, second.pageY - first.pageY);
}
