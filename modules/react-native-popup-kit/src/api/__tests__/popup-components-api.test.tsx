import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPopupController } from '../../core/popup-controller';
import type { InternalPopupController } from '../../core/popup-controller';
import { ToastType } from '../../toast/constants';
import { hideModal, showModal } from '../modal-api';
import { registerGlobalPopupController } from '../popup-api';
import { hideToast, showToast } from '../toast-api';

vi.mock('../../components/DefaultModal', () => ({
  DefaultModal: () => null,
}));
vi.mock('../../components/DefaultToast', () => ({
  DefaultToast: () => null,
}));

let controller: InternalPopupController;
let unregister: () => void;

beforeEach(() => {
  controller = createPopupController();
  unregister = registerGlobalPopupController(controller);
});

afterEach(() => {
  vi.useRealTimers();
  unregister();
  controller.dispose();
});

describe('toast facade', () => {
  it('queues instances and hides only the visible toast', async () => {
    await showToast({ message: 'first' });
    await showToast({ message: 'second' });
    const first = controller.store.getSnapshot().queueCurrent;
    first?.value.onShown?.();

    const hidden = hideToast();
    expect(controller.store.getSnapshot().closingIds.has(first?.id ?? '')).toBe(
      true,
    );
    if (first !== null) controller.store.complete(first.id);
    await hidden;

    expect(controller.store.getSnapshot().queueCurrent?.id).not.toBe(first?.id);
    expect(controller.store.getSnapshot().ids).toHaveLength(1);
  });

  it('starts automatic closing only after the toast is shown', async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    await showToast({ duration: 50, message: 'timed', onClose });
    const toast = controller.store.getSnapshot().queueCurrent;

    await vi.advanceTimersByTimeAsync(100);
    expect(controller.store.getSnapshot().closingIds.size).toBe(0);
    toast?.value.onShown?.();
    await vi.advanceTimersByTimeAsync(50);
    expect(controller.store.getSnapshot().closingIds.has(toast?.id ?? '')).toBe(
      true,
    );
    if (toast !== null) controller.store.complete(toast.id);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps loading visible when duration is omitted', async () => {
    vi.useFakeTimers();
    await showToast({ message: 'loading', type: ToastType.LOADING });
    const toast = controller.store.getSnapshot().queueCurrent;
    toast?.value.onShown?.();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(controller.store.getSnapshot().closingIds.size).toBe(0);
  });
});

describe('modal facade', () => {
  it('stacks modals and hides the highest live instance', async () => {
    const firstClose = vi.fn();
    const secondClose = vi.fn();
    await showModal({ content: 'first', onClose: firstClose });
    await showModal({ content: 'second', onClose: secondClose });
    const stack = controller.store.getSnapshot().stack;
    const top = stack.at(-1);

    const hidden = hideModal();
    expect(controller.store.getSnapshot().closingIds.has(top?.id ?? '')).toBe(
      true,
    );
    if (top !== undefined) controller.store.complete(top.id);
    await hidden;

    expect(firstClose).not.toHaveBeenCalled();
    expect(secondClose).toHaveBeenCalledOnce();
    expect(controller.store.getSnapshot().stack).toHaveLength(1);
  });
});
