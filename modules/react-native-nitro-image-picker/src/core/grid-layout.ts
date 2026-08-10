export function normalizeMeasuredWidth(width: number): number | undefined {
  if (!Number.isFinite(width) || width <= 0) return undefined;
  return Math.max(1, Math.round(width));
}

export function calculateGridCellSize(
  containerWidth: number | undefined,
  columns: number,
  sidePadding: number,
  gap: number,
): number | undefined {
  if (!containerWidth || columns <= 0) return undefined;
  const availableWidth = containerWidth - sidePadding * 2;
  if (availableWidth <= 0) return undefined;
  return Math.max(1, Math.floor(availableWidth / columns - gap));
}
