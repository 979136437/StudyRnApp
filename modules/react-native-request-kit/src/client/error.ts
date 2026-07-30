export type RequestErrorOptions = {
  cause: unknown;
  code: string;
  responseBody?: unknown;
  response?: unknown;
  status: number;
};

export class RequestError extends Error {
  readonly code: string;
  readonly originalError: unknown;
  readonly responseBody?: unknown;
  readonly response?: unknown;
  readonly status: number;

  constructor(message: string, options: RequestErrorOptions) {
    super(message);
    this.name = 'RequestError';
    this.code = options.code;
    this.originalError = options.cause;
    this.responseBody = options.responseBody;
    this.response = options.response;
    this.status = options.status;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export function isRequestCancelled(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.name === 'CancelledError' ||
      error.message === 'CancelledError')
  );
}

export function isRetryableRequestError(error: unknown): boolean {
  if (!(error instanceof RequestError)) {
    return false;
  }

  if (error.code === 'AUTH_REFRESH_FAILED') {
    return false;
  }

  return (
    error.isNetworkError ||
    error.status === 408 ||
    error.status === 429 ||
    error.status >= 500
  );
}

export async function normalizeRequestError(
  error: unknown,
): Promise<RequestError> {
  if (error instanceof RequestError) {
    return error;
  }

  return new RequestError(
    error instanceof Error ? error.message : 'Unknown request error',
    {
      cause: error,
      code: 'UNKNOWN_ERROR',
      status: -1,
    },
  );
}
