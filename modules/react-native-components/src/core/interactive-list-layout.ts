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

export function findReorderTargetWithHysteresis(
  layouts: readonly InteractiveListItemLayout[],
  activeIndex: number,
  currentTargetIndex: number,
  activeCenter: number,
  hysteresis: number,
): number {
  if (
    activeIndex < 0 ||
    activeIndex >= layouts.length ||
    currentTargetIndex < 0 ||
    currentTargetIndex >= layouts.length
  ) {
    return activeIndex;
  }

  const rawTargetIndex = findReorderTarget(layouts, activeIndex, activeCenter);
  const thresholdPadding = Math.max(0, hysteresis);
  let targetIndex = currentTargetIndex;

  while (targetIndex < rawTargetIndex) {
    const crossedIndex =
      targetIndex < activeIndex ? targetIndex : targetIndex + 1;
    const crossedLayout = layouts[crossedIndex];
    const boundary = crossedLayout.offset + crossedLayout.length / 2;
    if (activeCenter <= boundary + thresholdPadding) {
      break;
    }
    targetIndex += 1;
  }

  while (targetIndex > rawTargetIndex) {
    const crossedIndex =
      targetIndex > activeIndex ? targetIndex : targetIndex - 1;
    const crossedLayout = layouts[crossedIndex];
    const boundary = crossedLayout.offset + crossedLayout.length / 2;
    if (activeCenter >= boundary - thresholdPadding) {
      break;
    }
    targetIndex -= 1;
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

export function getExchangeAnimationIndex(
  activeIndex: number,
  currentTargetIndex: number,
  nextTargetIndex: number,
): number | undefined {
  if (
    activeIndex < 0 ||
    currentTargetIndex < 0 ||
    nextTargetIndex < 0 ||
    currentTargetIndex === nextTargetIndex
  ) {
    return undefined;
  }

  if (currentTargetIndex === activeIndex) {
    return nextTargetIndex;
  }
  if (nextTargetIndex === activeIndex) {
    return currentTargetIndex;
  }

  const currentDirection = Math.sign(currentTargetIndex - activeIndex);
  const nextDirection = Math.sign(nextTargetIndex - activeIndex);
  if (currentDirection !== nextDirection) {
    return nextTargetIndex;
  }

  return Math.abs(nextTargetIndex - activeIndex) >
    Math.abs(currentTargetIndex - activeIndex)
    ? nextTargetIndex
    : currentTargetIndex;
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

export function haveSameKeyOrder(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((key, index) => key === right[index])
  );
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
