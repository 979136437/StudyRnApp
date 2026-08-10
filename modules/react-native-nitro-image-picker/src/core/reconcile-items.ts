function shallowEqual<T extends object>(left: T, right: T): boolean {
  const leftKeys = Object.keys(left) as (keyof T)[];
  const rightKeys = Object.keys(right) as (keyof T)[];
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.is(left[key], right[key]))
  );
}

export function reconcileOrderedItems<T extends object>(
  current: T[],
  incoming: T[],
  getKey: (item: T) => string,
): T[] {
  const currentByKey = new Map(current.map((item) => [getKey(item), item]));
  const reconciled = incoming.map((item) => {
    const existing = currentByKey.get(getKey(item));
    return existing && shallowEqual(existing, item) ? existing : item;
  });
  const unchanged =
    current.length === reconciled.length &&
    current.every((item, index) => item === reconciled[index]);
  return unchanged ? current : reconciled;
}
