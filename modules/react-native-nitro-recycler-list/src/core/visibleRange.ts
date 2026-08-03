import type { VisibleRange } from '../specs/RecyclerList.nitro';

const EMPTY_RANGE: VisibleRange = { first: -1, last: -1 };

export function translateVisibleRange(
  range: VisibleRange,
  dataLength: number,
  headerCount: number,
): VisibleRange {
  if (dataLength <= 0 || range.first < 0 || range.last < 0) {
    return EMPTY_RANGE;
  }

  const dataStart = headerCount;
  const dataEnd = headerCount + dataLength - 1;
  const first = Math.max(range.first, dataStart);
  const last = Math.min(range.last, dataEnd);
  if (first > last) return EMPTY_RANGE;

  return {
    first: first - dataStart,
    last: last - dataStart,
  };
}
