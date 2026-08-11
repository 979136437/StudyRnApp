import { describe, expect, it, vi } from 'vitest';

import { createCompressionTask } from '../task';

describe('compression task', () => {
  it('uses one stable id and cancels at most once', async () => {
    const cancel = vi.fn(() => true);
    const task = createCompressionTask(
      () => 'task-id',
      cancel,
      async (id) => id,
    );
    await expect(task.result).resolves.toBe('task-id');
    expect(task.cancel()).toBe(true);
    expect(task.cancel()).toBe(false);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('maps native cancellation and processing failures', async () => {
    const cancelled = createCompressionTask(
      () => 'cancelled',
      () => true,
      async () => {
        throw new Error('Compression cancelled');
      },
    );
    await expect(cancelled.result).rejects.toMatchObject({ code: 'CANCELLED' });

    const failed = createCompressionTask(
      () => 'failed',
      () => true,
      async () => {
        throw new Error('codec failed');
      },
    );
    await expect(failed.result).rejects.toMatchObject({ code: 'NATIVE_ERROR' });
  });
});
