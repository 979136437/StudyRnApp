import { CompressorError, type CompressionTask } from '../types';

export const normalizeCompressorError = (error: unknown) => {
  if (error instanceof CompressorError) return error;
  const message = error instanceof Error ? error.message : '原生媒体处理失败';
  if (/cancel/i.test(message)) {
    return new CompressorError('CANCELLED', '媒体处理已取消', error);
  }
  return new CompressorError('NATIVE_ERROR', message, error);
};

export const createCompressionTask = <TResult>(
  createId: () => string,
  cancel: (id: string) => boolean,
  run: (id: string) => Promise<TResult>,
): CompressionTask<TResult> => {
  const id = createId();
  let cancellationRequested = false;
  return {
    id,
    result: run(id).catch((error) =>
      Promise.reject(normalizeCompressorError(error)),
    ),
    cancel: () => {
      if (cancellationRequested) return false;
      cancellationRequested = true;
      return cancel(id);
    },
  };
};
