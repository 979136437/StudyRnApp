export interface InteractiveListItemLayout {
  index: number;
  length: number;
  offset: number;
}

export interface AutoScrollOptions {
  edgeSize: number;
  maxSpeed: number;
  pointerY: number;
  viewportEnd: number;
  viewportStart: number;
}

export function buildItemLayouts(
  keys: readonly string[],
  measuredLengths: ReadonlyMap<string, number>,
  estimatedItemSize: number,
): InteractiveListItemLayout[] {
  const layouts: InteractiveListItemLayout[] = [];
  let offset = 0;

  keys.forEach((key, index) => {
    const measuredLength = measuredLengths.get(key);
    const length =
      measuredLength !== undefined && measuredLength > 0
        ? measuredLength
        : estimatedItemSize;
    layouts.push({ index, length, offset });
    offset += length;
  });

  return layouts;
}

export function findReorderTarget(
  layouts: readonly InteractiveListItemLayout[],
  activeIndex: number,
  activeCenter: number,
): number {
  if (activeIndex < 0 || activeIndex >= layouts.length) {
    return activeIndex;
  }

  let targetIndex = activeIndex;
  if (activeCenter < layouts[activeIndex].offset) {
    for (let index = activeIndex - 1; index >= 0; index -= 1) {
      const layout = layouts[index];
      if (activeCenter < layout.offset + layout.length / 2) {
        targetIndex = index;
      } else {
        break;
      }
    }
  } else {
    for (let index = activeIndex + 1; index < layouts.length; index += 1) {
      const layout = layouts[index];
      if (activeCenter > layout.offset + layout.length / 2) {
        targetIndex = index;
      } else {
        break;
      }
    }
  }

  return targetIndex;
}

export function getReorderOffsets(
  layouts: readonly InteractiveListItemLayout[],
  activeIndex: number,
  targetIndex: number,
): number[] {
  const offsets = layouts.map(() => 0);
  const activeLayout = layouts[activeIndex];
  if (!activeLayout || activeIndex === targetIndex) {
    return offsets;
  }

  if (targetIndex > activeIndex) {
    let activeOffset = 0;
    for (let index = activeIndex + 1; index <= targetIndex; index += 1) {
      activeOffset += layouts[index].length;
      offsets[index] = -activeLayout.length;
    }
    offsets[activeIndex] = activeOffset;
  } else {
    let activeOffset = 0;
    for (let index = targetIndex; index < activeIndex; index += 1) {
      activeOffset -= layouts[index].length;
      offsets[index] = activeLayout.length;
    }
    offsets[activeIndex] = activeOffset;
  }

  return offsets;
}

export function reorderItems<T>(
  items: readonly T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return [...items];
  }

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, movedItem);
  return nextItems;
}

export function getAutoScrollSpeed({
  edgeSize,
  maxSpeed,
  pointerY,
  viewportEnd,
  viewportStart,
}: AutoScrollOptions): number {
  if (edgeSize <= 0 || maxSpeed <= 0 || viewportEnd <= viewportStart) {
    return 0;
  }

  const topEdge = viewportStart + edgeSize;
  if (pointerY < topEdge) {
    const progress = Math.min(1, Math.max(0, (topEdge - pointerY) / edgeSize));
    return -maxSpeed * progress;
  }

  const bottomEdge = viewportEnd - edgeSize;
  if (pointerY > bottomEdge) {
    const progress = Math.min(
      1,
      Math.max(0, (pointerY - bottomEdge) / edgeSize),
    );
    return maxSpeed * progress;
  }

  return 0;
}
