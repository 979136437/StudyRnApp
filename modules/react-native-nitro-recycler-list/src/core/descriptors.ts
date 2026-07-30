import type {
  ItemDescriptor,
  RecyclerLayout,
} from '../specs/RecyclerList.nitro';

export interface DescriptorOptions<T> {
  data: readonly T[];
  keyExtractor: (item: T, index: number) => string;
  getItemType?: (item: T, index: number) => string | number;
  getItemSpan?: (item: T, index: number) => number;
  getStickyLevel?: (item: T, index: number) => number | undefined;
  getStickyGroup?: (item: T, index: number) => string | number | undefined;
  estimatedItemSize: number;
  layout: RecyclerLayout;
  numColumns: number;
}

export function createDescriptors<T>({
  data,
  keyExtractor,
  getItemType,
  getItemSpan,
  getStickyLevel,
  getStickyGroup,
  estimatedItemSize,
  layout,
  numColumns,
}: DescriptorOptions<T>): ItemDescriptor[] {
  const keys = new Set<string>();

  return data.map((item, index) => {
    const key = keyExtractor(item, index);
    if (keys.has(key)) {
      throw new Error(
        `[react-native-nitro-recycler-list] keyExtractor 返回了重复键：${key}`,
      );
    }
    keys.add(key);

    const requestedSpan = getItemSpan?.(item, index) ?? 1;
    const stickyLevel = getStickyLevel?.(item, index) ?? -1;
    const normalizedStickyLevel = Math.max(-1, Math.trunc(stickyLevel));
    const span =
      layout === 'list' ? 1 : clampInteger(requestedSpan, 1, numColumns);

    if (stickyLevel >= 0 && span !== numColumns && layout !== 'list') {
      throw new Error(
        `[react-native-nitro-recycler-list] 吸顶项 ${key} 必须占满所有列。`,
      );
    }

    return {
      key,
      type: String(getItemType?.(item, index) ?? 'default'),
      span,
      stickyLevel: normalizedStickyLevel,
      stickyGroup:
        normalizedStickyLevel < 0
          ? ''
          : String(getStickyGroup?.(item, index) ?? '__default__'),
      estimatedSize: positiveOrDefault(estimatedItemSize, 100),
    };
  });
}

export function normalizeListOptions(options: {
  layout?: RecyclerLayout;
  horizontal?: boolean;
  numColumns?: number;
  estimatedItemSize?: number;
  overscan?: number;
}) {
  const layout = options.layout ?? 'list';
  const horizontal = options.horizontal ?? false;
  if (horizontal && layout !== 'list') {
    throw new Error(
      '[react-native-nitro-recycler-list] 横向模式首版仅支持 layout="list"。',
    );
  }

  return {
    layout,
    horizontal,
    numColumns:
      layout === 'list' ? 1 : clampInteger(options.numColumns ?? 2, 1, 64),
    estimatedItemSize: positiveOrDefault(options.estimatedItemSize, 100),
    overscan: Math.max(0, options.overscan ?? 1),
  };
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function positiveOrDefault(
  value: number | undefined,
  fallback: number,
): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}
