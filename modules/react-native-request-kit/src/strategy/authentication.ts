import { RequestError } from '../client/error';
import { finalData } from '../client/finalData';
import type {
  AnyMethod,
  CreateRequestOptions,
  MaybePromise,
  RespondedHandlers,
} from '../types';

export type AuthRole = 'login' | 'logout' | 'refreshToken';

export type TokenAuthenticationOptions = {
  assignToken(method: AnyMethod): MaybePromise<void>;
  isVisitor?: (method: AnyMethod) => boolean;
  login?: (data: unknown, method: AnyMethod) => MaybePromise<void>;
  logout?: (data: unknown, method: AnyMethod) => MaybePromise<void>;
  matchRole?: (method: AnyMethod, role: AuthRole) => boolean;
  refreshToken(method: AnyMethod): MaybePromise<void>;
};

export type ClientTokenAuthenticationOptions = TokenAuthenticationOptions & {
  isTokenExpired(method: AnyMethod): MaybePromise<boolean>;
};

export type ServerTokenAuthenticationOptions<TResponse = Response> =
  TokenAuthenticationOptions & {
    isResponseExpired(
      response: TResponse | RequestError,
      method: AnyMethod,
    ): MaybePromise<boolean>;
  };

export type TokenAuthentication<TResponse = Response> = {
  onAuthRequired(
    previous?: CreateRequestOptions<any, any, any>['beforeRequest'],
  ): NonNullable<CreateRequestOptions<any, any, any>['beforeRequest']>;
  onResponseRefreshToken<TTransformed = unknown>(
    previous?: RespondedHandlers<TResponse, TTransformed>,
  ): RespondedHandlers<TResponse, TTransformed>;
};

export function createClientTokenAuthentication<TResponse = Response>(
  options: ClientTokenAuthenticationOptions,
): TokenAuthentication<TResponse> {
  return createAuthentication<TResponse>(
    options,
    (method) => options.isTokenExpired(method),
    async () => false,
  );
}

export function createServerTokenAuthentication<TResponse = Response>(
  options: ServerTokenAuthenticationOptions<TResponse>,
): TokenAuthentication<TResponse> {
  return createAuthentication<TResponse>(
    options,
    async () => false,
    options.isResponseExpired,
  );
}

function createAuthentication<TResponse = Response>(
  options: TokenAuthenticationOptions,
  isExpiredBeforeRequest: (method: AnyMethod) => MaybePromise<boolean>,
  isExpired: (
    value: TResponse | RequestError,
    method: AnyMethod,
  ) => MaybePromise<boolean>,
): TokenAuthentication<TResponse> {
  let refreshing: Promise<void> | undefined;
  const replaying = new WeakSet<AnyMethod>();
  const roleOf = (method: AnyMethod, role: AuthRole) =>
    options.matchRole?.(method, role) ?? method.meta.authRole === role;
  const isVisitor = (method: AnyMethod) =>
    options.isVisitor?.(method) ??
    method.meta.ignoreTokenAuthentication === true;
  const refresh = async (method: AnyMethod) => {
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
  const replay = async (method: AnyMethod) => {
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
    onAuthRequired: (previous) => async (method) => {
      await previous?.(method);
      if (
        isVisitor(method) ||
        roleOf(method, 'login') ||
        roleOf(method, 'refreshToken')
      ) {
        return;
      }
      if (await isExpiredBeforeRequest(method)) await refresh(method);
      await options.assignToken(method);
    },
    onResponseRefreshToken: <TTransformed = unknown>(
      previous: RespondedHandlers<TResponse, TTransformed> = {},
    ) => ({
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
          return finalData(await replay(method)) as unknown as TTransformed;
        }
        const data =
          previous.onSuccess === undefined
            ? await parseResponse(response, method.type === 'HEAD')
            : await previous.onSuccess(response, method);
        if (roleOf(method, 'login')) await options.login?.(data, method);
        if (roleOf(method, 'logout')) await options.logout?.(data, method);
        return data as TTransformed;
      },
    }),
  };
}

async function parseResponse(
  response: unknown,
  isHead: boolean,
): Promise<unknown> {
  if (typeof Response === 'undefined' || !(response instanceof Response)) {
    return response;
  }
  if (response.status === 204 || isHead) return undefined;
  const contentType = response.headers.get('content-type') ?? '';
  return contentType.includes('application/json')
    ? response.json()
    : response.text();
}

export function onAuthRequired<TResponse>(
  authentication: TokenAuthentication<TResponse>,
  previous?: CreateRequestOptions<any, any, any>['beforeRequest'],
) {
  return authentication.onAuthRequired(previous);
}

export function onResponseRefreshToken<TResponse, TTransformed>(
  authentication: TokenAuthentication<TResponse>,
  previous?: RespondedHandlers<TResponse, TTransformed>,
) {
  return authentication.onResponseRefreshToken(previous);
}
