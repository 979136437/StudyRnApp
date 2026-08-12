import { MediaKitError } from './error';
import type { MediaTask } from './types';

let sequence = 0;

export interface TaskContext {
  readonly cancelled: boolean;
  throwIfCancelled(): void;
  onCancel(callback: () => void | Promise<void>): void;
}

export const createMediaTask = <T>(
  run: (context: TaskContext) => Promise<T>,
): MediaTask<T> => {
  const id = `media-kit-${Date.now()}-${++sequence}`;
  let cancelled = false;
  let settled = false;
  const callbacks = new Set<() => void | Promise<void>>();
  const context: TaskContext = {
    get cancelled() {
      return cancelled;
    },
    throwIfCancelled() {
      if (cancelled) throw new MediaKitError('CANCELLED', '媒体任务已取消');
    },
    onCancel(callback) {
      if (cancelled) void callback();
      else callbacks.add(callback);
    },
  };
  const result = Promise.resolve()
    .then(() => {
      context.throwIfCancelled();
      return run(context);
    })
    .finally(() => {
      settled = true;
      callbacks.clear();
    });
  return {
    id,
    result,
    cancel() {
      if (cancelled || settled) return false;
      cancelled = true;
      for (const callback of callbacks) void callback();
      return true;
    },
  };
};
