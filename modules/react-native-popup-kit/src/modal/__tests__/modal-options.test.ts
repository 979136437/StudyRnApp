import { describe, expect, it, vi } from 'vitest';

import { createModalConfirmationController } from '../modal-confirmation';
import {
  DEFAULT_CANCEL_TEXT,
  DEFAULT_CONFIRM_TEXT,
  resolveModalAction,
} from '../modal-options';

describe('modal options', () => {
  it('resolves complete default actions', () => {
    expect(resolveModalAction(undefined, DEFAULT_CONFIRM_TEXT)).toEqual({
      text: '确定',
    });
    expect(resolveModalAction({}, DEFAULT_CANCEL_TEXT)).toEqual({
      text: '取消',
    });
  });

  it('keeps custom action values', () => {
    expect(
      resolveModalAction(
        { style: { opacity: 0.5 }, text: '提交' },
        DEFAULT_CONFIRM_TEXT,
      ),
    ).toEqual({ style: { opacity: 0.5 }, text: '提交' });
  });

  it('defaults confirmation to close and respects false or rejection', async () => {
    await expect(createModalConfirmationController({}).confirm()).resolves.toBe(
      true,
    );
    await expect(
      createModalConfirmationController({
        onConfirm: async () => false,
      }).confirm(),
    ).resolves.toBe(false);
    await expect(
      createModalConfirmationController({
        onConfirm: async () => {
          throw new Error('failed');
        },
      }).confirm(),
    ).resolves.toBe(false);
  });

  it('blocks duplicate confirmation and cancellation while pending', async () => {
    let finish: ((value: boolean) => void) | undefined;
    const onCancel = vi.fn();
    const controller = createModalConfirmationController({
      onCancel,
      onConfirm: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const first = controller.confirm();
    expect(controller.isConfirming()).toBe(true);
    await expect(controller.confirm()).resolves.toBe(false);
    controller.cancel();
    expect(onCancel).not.toHaveBeenCalled();
    finish?.(true);
    await expect(first).resolves.toBe(true);
    expect(controller.isConfirming()).toBe(false);
  });
});
