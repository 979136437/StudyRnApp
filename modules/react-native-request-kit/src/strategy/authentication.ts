import { RequestError } from '../client/error';
import type { Method } from '../client/Method';
import type {
  CreateRequestOptions,
  MaybePromise,
  RespondedHandlers,
} from '../types';

export type AuthRole = 'login' | 'logout' | 'refreshToken';

export type TokenAuthenticationOptions = {
  assignToken(method: Method<unknown>): MaybePromise<void>;
  isVisitor?: (method: Method<unknown>) => boolean;
  login?: (data: unknown, method: Method<unknown>) => MaybePromise<void>;
  logout?: (data: unknown, method: Method<unknown>) => MaybePromise<void>;
  matchRole?: (method: Method<unknown>, role: AuthRole) => boolean;
  refreshToken(method: Method<unknown>): MaybePromise<void>;
};

export type ClientTokenAuthenticationOptions = TokenAuthenticationOptions & {
  isTokenExpired(method: Method<unknown>): MaybePromise<boolean>;
};

export type ServerTokenAuthenticationOptions = TokenAuthenticationOptions & {
  isResponseExpired(
    response: Response | RequestError,
    method: Method<unknown>,
  ): MaybePromise<boolean>;
};

export type TokenAuthentication = {
  onAuthRequired(
    previous?: CreateRequestOptions['beforeRequest'],
  ): NonNullable<CreateRequestOptions['beforeRequest']>;
  onResponseRefreshToken(previous?: RespondedHandlers): RespondedHandlers;
};

export function createClientTokenAuthentication(
  options: ClientTokenAuthenticationOptions,
): TokenAuthentication {
  return createAuthentication(
    options,
    (method) => options.isTokenExpired(method),
    async () => false,
  );
}

export function createServerTokenAuthentication(
  options: ServerTokenAuthenticationOptions,
): TokenAuthentication {
  return createAuthentication(
    options,
    async () => false,
    options.isResponseExpired,
  );
}

function createAuthentication(
  options: TokenAuthenticationOptions,
  isExpiredBeforeRequest: (method: Method<unknown>) => MaybePromise<boolean>,
  isExpired: (
    value: Response | RequestError,
    method: Method<unknown>,
  ) => MaybePromise<boolean>,
): TokenAuthentication {
  let refreshing: Promise<void> | undefined;
  const replaying = new WeakSet<Method<unknown>>();
  const roleOf = (method: Method<unknown>, role: AuthRole) =>
    options.matchRole?.(method, role) ?? method.meta.authRole === role;
  const isVisitor = (method: Method<unknown>) =>
    options.isVisitor?.(method) ??
    method.meta.ignoreTokenAuthentication === true;
  const refresh = async (method: Method<unknown>) => {
    refreshing ??= Promise.resolve(options.refreshToken(method))
      .catch((error) => {
        throw new RequestError('Token refresh failed', {
          cause: error,
          code: 'AUTH_REFRESH_FAILED',
          status: 401,
        });
      })
      .finally(() => {
        setTimeout(() => {
          refreshing = undefined;
        }, 0);
      });
    return refreshing;
  };
  const replay = async (method: Method<unknown>) => {
    if (replaying.has(method)) {
      throw new RequestError('Token refresh replay limit exceeded', {
        cause: undefined,
        code: 'AUTH_REPLAY_LIMIT',
        status: 401,
      });
    }
    replaying.add(method);
    try {
      await refresh(method);
      await options.assignToken(method);
      return await method.executeOnce();
    } finally {
      replaying.delete(method);
    }
  };

  return {
    onAuthRequired: (previous) => async (request, method) => {
      let nextRequest =
        previous === undefined ? request : await previous(request, method);
      if (
        isVisitor(method) ||
        roleOf(method, 'login') ||
        roleOf(method, 'refreshToken')
      ) {
        return nextRequest;
      }
      if (await isExpiredBeforeRequest(method)) await refresh(method);
      const mergedHeaders = new Headers(nextRequest.headers);
      for (const [name, value] of method.headers)
        mergedHeaders.set(name, value);
      for (const [name, value] of mergedHeaders)
        method.headers.set(name, value);
      await options.assignToken(method);
      nextRequest = new Request(nextRequest, { headers: method.headers });
      return nextRequest;
    },
    onResponseRefreshToken: (previous = {}) => ({
      onComplete: async (method, result) => {
        await previous.onComplete?.(method, result);
      },
      onError: async (error, method) => {
        if (
          !isVisitor(method) &&
          !roleOf(method, 'login') &&
          !roleOf(method, 'logout') &&
          !roleOf(method, 'refreshToken') &&
          !replaying.has(method) &&
          (await isExpired(error, method))
        ) {
          return replay(method);
        }
        if (previous.onError !== undefined)
          return previous.onError(error, method);
        throw error;
      },
      onSuccess: async (response, method) => {
        if (
          !isVisitor(method) &&
          !roleOf(method, 'login') &&
          !roleOf(method, 'logout') &&
          !roleOf(method, 'refreshToken') &&
          !replaying.has(method) &&
          (await isExpired(response, method))
        ) {
          return replay(method);
        }
        const data =
          previous.onSuccess === undefined
            ? await parseResponse(response, method.type === 'HEAD')
            : await previous.onSuccess(response, method);
        if (roleOf(method, 'login')) await options.login?.(data, method);
        if (roleOf(method, 'logout')) await options.logout?.(data, method);
        return data;
      },
    }),
  };
}

async function parseResponse(
  response: Response,
  isHead: boolean,
): Promise<unknown> {
  if (response.status === 204 || isHead) return undefined;
  const contentType = response.headers.get('content-type') ?? '';
  return contentType.includes('application/json')
    ? response.json()
    : response.text();
}

export function onAuthRequired(
  authentication: TokenAuthentication,
  previous?: CreateRequestOptions['beforeRequest'],
) {
  return authentication.onAuthRequired(previous);
}

export function onResponseRefreshToken(
  authentication: TokenAuthentication,
  previous?: RespondedHandlers,
) {
  return authentication.onResponseRefreshToken(previous);
}
