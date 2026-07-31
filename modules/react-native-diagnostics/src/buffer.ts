/** 返回只保留末尾指定数量元素的新数组。 */
export function appendBounded<T>(
  current: readonly T[],
  value: T,
  limit: number,
): T[] {
  const maximum = Math.max(1, Math.trunc(limit));
  const next = [...current, value];
  return next.length <= maximum ? next : next.slice(next.length - maximum);
}
