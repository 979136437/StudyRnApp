import type { MediaKitErrorCode } from './types';

export class MediaKitError extends Error {
  constructor(
    readonly code: MediaKitErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'MediaKitError';
  }
}

export const normalizeError = (
  error: unknown,
  code: MediaKitErrorCode,
  message: string,
) => {
  if (error instanceof MediaKitError) return error;
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'CANCELLED'
  ) {
    return new MediaKitError('CANCELLED', '媒体任务已取消', error);
  }
  return new MediaKitError(code, message, error);
};

export const unavailable = (capability: string) =>
  new MediaKitError('UNAVAILABLE', `${capability}在当前平台不可用`);
