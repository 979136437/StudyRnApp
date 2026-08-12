import { describe, expect, it, vi } from 'vitest';

import { createMediaTask } from '../task';

describe('媒体任务', () => {
  it('取消幂等且排队阶段不会执行主体', async () => {
    const run = vi.fn(async () => 'done');
    const task = createMediaTask(run);
    expect(task.cancel()).toBe(true);
    expect(task.cancel()).toBe(false);
    await expect(task.result).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(run).not.toHaveBeenCalled();
  });

  it('任务完成后取消不再改变状态', async () => {
    const task = createMediaTask(async () => 'done');
    await expect(task.result).resolves.toBe('done');
    expect(task.cancel()).toBe(false);
  });
});
