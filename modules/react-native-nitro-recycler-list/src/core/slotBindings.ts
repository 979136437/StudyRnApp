import type { SlotBinding } from '../specs/RecyclerList.nitro';

/**
 * 比较原生槽位快照，避免相同绑定被反复写入 React 状态。
 *
 * 原生列表在布局和滚动期间可能多次发布当前可见槽位。只有槽位、索引或绑定项
 * 真正变化时才需要重新渲染 React 子树，否则会形成原生刷新与 React 更新之间的
 * 无效往返。
 */
export function areSlotBindingsEqual(
  current: readonly SlotBinding[],
  next: readonly SlotBinding[],
): boolean {
  if (current === next) return true;
  if (current.length !== next.length) return false;

  return current.every((binding, index) => {
    const candidate = next[index];
    return (
      candidate !== undefined &&
      binding.slotId === candidate.slotId &&
      binding.index === candidate.index &&
      binding.itemKey === candidate.itemKey &&
      binding.itemType === candidate.itemType
    );
  });
}
