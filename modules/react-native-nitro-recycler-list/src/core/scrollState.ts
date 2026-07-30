const offsets = new Map<string, number>();

export function readSavedOffset(listKey: string | undefined): number {
  if (!listKey) return 0;
  return offsets.get(listKey) ?? 0;
}

export function saveOffset(listKey: string | undefined, offset: number): void {
  if (!listKey || !Number.isFinite(offset)) return;
  offsets.set(listKey, Math.max(0, offset));
}

export function clearSavedOffset(listKey: string): void {
  offsets.delete(listKey);
}
