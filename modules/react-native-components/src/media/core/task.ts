import type { MediaCallbacks } from '../types';
import { MediaApiError } from '../types';

export const asMediaError = (error: unknown, fallback: string) =>
  error instanceof MediaApiError
    ? error
    : new MediaApiError('FILE_ERROR', fallback, error);

export const runMediaTask = <TResult>(
  callbacks: MediaCallbacks<TResult>,
  executor: () => Promise<TResult>,
) =>
  Promise.resolve()
    .then(executor)
    .then(
      (result) => {
        callbacks.success?.(result);
        callbacks.complete?.(result);
        return result;
      },
      (reason) => {
        const error = asMediaError(reason, '媒体操作失败');
        callbacks.fail?.(error);
        callbacks.complete?.(error);
        throw error;
      },
    );
