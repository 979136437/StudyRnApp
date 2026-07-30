export function validateTabKeys(tabs: readonly { key: string }[]): string[] {
  const keys = tabs.map((tab) => tab.key);
  if (keys.length === 0) {
    throw new Error(
      '[react-native-nitro-recycler-list] RecyclerTabView 至少需要一个 Tab。',
    );
  }
  if (new Set(keys).size !== keys.length) {
    throw new Error(
      '[react-native-nitro-recycler-list] RecyclerTabView 的 Tab 键不能重复。',
    );
  }
  return keys;
}

export function resolveTabTargetOffset(
  collapseOffset: number,
  collapseRange: number,
  savedOffset: number,
): number {
  const collapsed = Math.min(
    Math.max(0, collapseRange),
    Math.max(0, collapseOffset),
  );
  return collapsed < collapseRange
    ? collapsed
    : Math.max(collapsed, savedOffset);
}
