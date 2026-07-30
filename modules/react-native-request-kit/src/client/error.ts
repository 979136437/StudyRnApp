import { HTTPError, isNetworkError, isTimeoutError, type KyResponse } from 'ky';

type RequestErrorOptions = {
  cause: unknown;
  code: string;
  responseBody?: unknown;
  status: number;
};

export class RequestError extends Error {
  readonly code: string;
  readonly originalError: unknown;
  readonly responseBody?: unknown;
  readonly status: number;

  constructor(message: string, options: RequestErrorOptions) {
    super(message);
    this.name = 'RequestError';
    this.code = options.code;
    this.originalError = options.cause;
    this.responseBody = options.responseBody;
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

  if (error instanceof HTTPError) {
    const responseBody = error.data ?? (await readResponseBody(error.response));
    return new RequestError(
      readErrorMessage(responseBody) ??
        `Request failed with status ${error.response.status}`,
      {
        cause: error,
        code: readErrorCode(responseBody) ?? 'HTTP_ERROR',
        responseBody,
        status: error.response.status,
      },
    );
  }

  if (isTimeoutError(error)) {
    return new RequestError('Request timed out', {
      cause: error,
      code: 'TIMEOUT',
      status: 0,
    });
  }

  if (isNetworkError(error)) {
    return new RequestError('Network request failed', {
      cause: error,
      code: 'NETWORK_ERROR',
      status: 0,
    });
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

async function readResponseBody(response: KyResponse): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';

  try {
    if (contentType.includes('application/json')) {
      return await response.clone().json();
    }

    const text = await response.clone().text();
    return text.length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}

function readErrorMessage(body: unknown): string | undefined {
  if (typeof body === 'string') {
    return body;
  }

  if (isRecord(body) && typeof body.message === 'string') {
    return body.message;
  }

  return undefined;
}

function readErrorCode(body: unknown): string | undefined {
  return isRecord(body) && typeof body.code === 'string'
    ? body.code
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
