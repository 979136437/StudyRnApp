import { RequestError } from '../core/request-error';

export function createAbortError(cause?: unknown): Error {
  const error = new Error('Request was cancelled', { cause });
  error.name = 'AbortError';
  return error;
}

export function createHttpError(
  response: unknown,
  responseBody: unknown,
  status: number,
  statusText: string,
  cause?: unknown,
): RequestError {
  return new RequestError(
    readErrorMessage(responseBody) ||
      statusText ||
      `Request failed with status ${status}`,
    {
      cause,
      code: readErrorCode(responseBody) ?? 'HTTP_ERROR',
      response,
      responseBody,
      status,
    },
  );
}

export function createNetworkError(cause: unknown): RequestError {
  return new RequestError('Network request failed', {
    cause,
    code: 'NETWORK_ERROR',
    status: 0,
  });
}

export function createTimeoutError(cause: unknown): RequestError {
  return new RequestError('Request timed out', {
    cause,
    code: 'TIMEOUT',
    status: 0,
  });
}

export async function readResponseBody(response: Response): Promise<unknown> {
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
  if (typeof body === 'string') return body;
  return isRecord(body) && typeof body.message === 'string'
    ? body.message
    : undefined;
}

function readErrorCode(body: unknown): string | undefined {
  return isRecord(body) && typeof body.code === 'string'
    ? body.code
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
