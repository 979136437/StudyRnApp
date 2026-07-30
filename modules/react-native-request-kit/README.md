# react-native-request-kit

An alova-style request layer for React Native and Expo, powered by TanStack
Query with interchangeable Fetch, Axios, ky, or custom transports.

## Create a request instance

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createRequest } from 'react-native-request-kit';
import { createAsyncStoragePersister } from 'react-native-request-kit/cache';
import { RequestProvider } from 'react-native-request-kit/react';

export const request = createRequest({
  baseUrl: process.env.EXPO_PUBLIC_API_URL,
  timeout: 15_000,
  headers: {
    Accept: 'application/json',
  },
  beforeRequest: async (method) => {
    const token = await readTokenFromSecureStorage();
    if (token) method.headers.set('Authorization', `Bearer ${token}`);
  },
  responded: {
    onSuccess: async (response) => response.json(),
  },
  StoragePersister: createAsyncStoragePersister({
    key: 'MY_APP_REQUEST_CACHE',
    storage: AsyncStorage,
  }),
});

export function AppProviders({ children }: React.PropsWithChildren) {
  return <RequestProvider request={request}>{children}</RequestProvider>;
}
```

Omit `StoragePersister` to keep all cached data in memory. AsyncStorage is
unencrypted; never persist tokens, credentials, or other secrets.

Fetch is the default transport. Configure it explicitly when you need standard
`RequestInit` options or custom status validation:

```ts
import { createRequest } from 'react-native-request-kit';
import { createFetchRequestAdapter } from 'react-native-request-kit/adapter/fetch';

const request = createRequest({
  requestAdapter: createFetchRequestAdapter({
    credentials: 'include',
    validateStatus: (status) => status >= 200 && status < 400,
  }),
});
```

The package does not import Expo. Inject `expo/fetch` when its streaming native
implementation is preferred:

```ts
import { fetch as expoFetch } from 'expo/fetch';
import { createRequest } from 'react-native-request-kit';
import { createFetchRequestAdapter } from 'react-native-request-kit/adapter/fetch';

const request = createRequest({
  requestAdapter: createFetchRequestAdapter({
    fetch: (input, init) => expoFetch(input, init),
  }),
});
```

Fetch download progress is emitted only when the runtime exposes a readable
response stream. Unknown totals remain `0`, and upload byte progress is not
fabricated.

Use ky explicitly when its transport options are needed:

```ts
import { createRequest } from 'react-native-request-kit';
import { createKyRequestAdapter } from 'react-native-request-kit/adapter/ky';

const request = createRequest({
  requestAdapter: createKyRequestAdapter({ credentials: 'include' }),
});
```

Axios is also included in the package. Its adapter returns the complete
`AxiosResponse`, so extract business data in `responded.onSuccess`:

```ts
import { createRequest } from 'react-native-request-kit';
import { createAxiosRequestAdapter } from 'react-native-request-kit/adapter/axios';

type ApiResult<T> = { data: T };
type Todo = { id: number; title: string };

const request = createRequest({
  requestAdapter: createAxiosRequestAdapter<ApiResult<Todo>>({
    withCredentials: true,
  }),
  responded: {
    onSuccess: (response) => response.data,
  },
});
```

Pass `client` to reuse an existing `AxiosInstance` and its interceptors.

## Custom request adapters

Adapters follow the alova transport contract and may return non-Fetch response
and response-header types:

```ts
type NativeResponse = { body: { value: number }; status: number };
type NativeHeaders = { requestId: string };

const request = createRequest({
  requestAdapter: (elements, method) => {
    const task = nativeTransport.start(elements);
    return {
      response: () => task.response as Promise<NativeResponse>,
      headers: () => task.headers as Promise<NativeHeaders>,
      abort: () => task.abort(),
      onDownload: (update) => task.onDownload(update),
      onUpload: (update) => task.onUpload(update),
    };
  },
  responded: {
    onSuccess: (response) => response.body,
  },
});

const method = request.Get<{ value: number }>('native://value', {
  transform: (data, headers) => ({
    value: data.value,
    requestId: headers.requestId,
  }),
});
```

The request pipeline is `beforeRequest(method)` → adapter → `responded` →
Method `transform`. An adapter must return lazy `response` and `headers`
functions plus an idempotent `abort`. Progress callbacks receive
`(loaded, total)`. Throw `RequestError` from custom transports when retry logic
needs an HTTP-like status; other errors become `UNKNOWN_ERROR`.

When no custom adapter is supplied, Fetch responses honor `responseType` and
default to JSON. A custom adapter without `responded.onSuccess` returns its raw
response as the transform input.

### Migrating from 0.6

- Import optional features from their subpaths. The root entry now contains
  only the request client, Method, errors, and core types.
- Import Fetch, Axios, and ky from `adapter/fetch`, `adapter/axios`, and
  `adapter/ky`. This keeps unused transports out of Metro's module graph.
- Import React APIs, cache helpers, and request strategies from the `react`,
  `cache`, and `strategy` directory entries. Only adapters keep granular
  entries so unused Axios and ky transports stay out of Metro's module graph.

### Migrating from 0.5

- Fetch replaces ky as the default transport. Pass `createKyRequestAdapter()`
  explicitly when ky-specific options or progress behavior are required.
- Standard Fetch does not expose reliable upload progress. Upload strategies
  continue reporting file state and completion counts without fabricated bytes.

### Migrating from 0.4

- Replace `beforeRequest(request, method)` with `beforeRequest(method)` and
  update `method.headers` directly.
- Method `transform` now receives the result of `responded.onSuccess` and the
  adapter response headers, rather than bypassing the global response handler.

## Create and send methods

```ts
type Todo = { id: number; title: string };

export const getTodos = (page: number) =>
  request.Get<Todo[]>('todos', {
    name: 'todo-list',
    params: { page },
  });

export const createTodo = (title: string) =>
  request.Post<Todo>(
    'todos',
    { title },
    {
      hitSource: request.snapshots.match('todo-list'),
    },
  );

const todos = await getTodos(1);
const latestTodos = await getTodos(1).send(true);
```

`Get`, `Head`, and `Options` use stale-while-revalidate by default. Data is
fresh for five minutes, remains usable while it refreshes in the background
for up to 24 hours, and is discarded after that hard expiry.

Override caching per method:

```ts
request.Get('profile', { cacheFor: null });
request.Get('settings', { cacheFor: 60_000 });
request.Get('holidays', {
  cacheFor: { mode: 'restore', expire: new Date('2030-01-01'), tag: 'v1' },
});
request.Get('feed', {
  cacheFor: { mode: 'swr', staleTime: 30_000, expire: 3_600_000 },
});
```

## React hooks

```tsx
import { useRequest, useWatcher } from 'react-native-request-kit/react';

function TodoList({ page }: { page: number }) {
  const todos = useWatcher(() => getTodos(page), [page], {
    immediate: true,
    debounce: 150,
  });

  if (todos.loading) return <Loading />;

  return (
    <List
      data={todos.data ?? []}
      refreshing={todos.fetching}
      onRefresh={() => todos.send()}
    />
  );
}

function CreateButton() {
  const creation = useRequest((title) => createTodo(String(title)), {
    immediate: false,
  });

  return (
    <Button
      disabled={creation.loading}
      onPress={() => creation.send('New todo')}
      title="Create"
    />
  );
}
```

Hook results expose `loading`, `fetching`, `data`, `error`, upload/download
progress, `send`, `abort`, `update`, and success/error/complete event binders.

## Fetching and pagination

```tsx
import { useFetcher, usePagination } from 'react-native-request-kit/react';

const preloader = useFetcher<Todo[]>();
await preloader.fetch(getTodos(2));

const list = usePagination(
  (page, pageSize) =>
    request.Get<{ data: Todo[]; total: number }>('todos', {
      params: { page, pageSize },
    }),
  {
    initialPageSize: 20,
    data: (response) => response.data,
    total: (response) => response.total,
  },
);

list.update({ page: 2 });
await list.refresh();
await list.insert({ id: 10, title: 'Cached item' });
```

## Cache operations

```ts
import {
  invalidateCache,
  queryCache,
  setCache,
  updateState,
} from 'react-native-request-kit/cache';

const firstPage = getTodos(1);
const cached = queryCache(firstPage);
setCache(firstPage, (current) => [...(current ?? []), newTodo]);
updateState(firstPage, { data: cached });
await invalidateCache(firstPage);

const todoLists = request.snapshots.match(/^todo-/);
await invalidateCache(todoLists);

await request.clear();
```

## Request strategies

### Automatic requests

```tsx
import * as Network from 'expo-network';
import { useAutoRequest } from 'react-native-request-kit/strategy';

useAutoRequest.onNetwork = (notify) => {
  const subscription = Network.addNetworkStateListener((state) => {
    if (state.isConnected) notify();
  });
  return () => subscription.remove();
};

const todos = useAutoRequest(getTodos(1), {
  pollingTime: 30_000,
  throttle: 1000,
});
```

Visibility, focus, and network recovery are enabled by default. Native uses
`AppState` for foreground recovery; focus is web-only. Automatic sends still
follow SWR. Set the normal hook option `force: true` when every trigger must
wait for a fresh response.

All four listeners can be replaced for another runtime. Each receives
`(notify, config)` and returns an optional cleanup function:

```ts
useAutoRequest.onPolling = (notify, config) => {
  const timer = setInterval(notify, config.pollingTime);
  return () => clearInterval(timer);
};
useAutoRequest.onVisibility = (notify, config) => subscribeAppState(notify);
useAutoRequest.onFocus = (notify, config) => subscribeFocus(notify);
useAutoRequest.onNetwork = (notify, config) => subscribeNetwork(notify);
```

### Token authentication

```ts
import * as SecureStore from 'expo-secure-store';
import { createRequest } from 'react-native-request-kit';
import { createServerTokenAuthentication } from 'react-native-request-kit/strategy';

const authentication = createServerTokenAuthentication({
  assignToken: async (method) => {
    const token = await SecureStore.getItemAsync('access-token');
    if (token) method.headers.set('Authorization', `Bearer ${token}`);
  },
  isResponseExpired: (response) => response.status === 401,
  refreshToken: async () => {
    await refreshAndSaveTokens();
  },
  login: async (data) => saveLoginTokens(data),
  logout: async () => SecureStore.deleteItemAsync('access-token'),
});

export const request = createRequest({
  beforeRequest: authentication.onAuthRequired(),
  responded: authentication.onResponseRefreshToken(),
});

request.Post('login', credentials, { meta: { authRole: 'login' } });
request.Post('logout', undefined, { meta: { authRole: 'logout' } });
request.Get('public', { meta: { ignoreTokenAuthentication: true } });
```

Use `createClientTokenAuthentication` when expiry can be determined before a
request. Refresh is single-flight, concurrent callers wait for the same work,
and each failed request is replayed at most once. Token storage is always
owned by the application.

### Captcha and controlled retry

```tsx
import {
  useCaptcha,
  useRetriableRequest,
} from 'react-native-request-kit/strategy';

const captcha = useCaptcha(() => request.Post('captcha'), {
  initialCountdown: 60,
});

const retriable = useRetriableRequest(() => request.Get('unstable'), {
  retry: 3,
  backoff: { delay: 1000, multiplier: 2, startQuiver: 0.1, endQuiver: 0.1 },
});

retriable.onRetry(({ retryTimes, retryDelay }) => {
  console.log(retryTimes, retryDelay);
});
```

`useCaptcha` is always manual and starts its countdown only after success.
`useRetriableRequest` performs one network attempt per round, so Method and
TanStack retry counts are not multiplied. Call `stop()` to cancel the current
attempt or a pending backoff.

### Uploading

```tsx
import * as ImagePicker from 'expo-image-picker';
import { useUploader } from 'react-native-request-kit/strategy';

useUploader.selectFile = async () => {
  const result = await ImagePicker.launchImageLibraryAsync({
    allowsMultipleSelection: true,
  });
  return result.canceled
    ? []
    : result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.fileName ?? 'image',
        type: asset.mimeType,
      }));
};

const uploader = useUploader(
  (selected) => request.Post('uploads', buildUploadBody(selected)),
  { limit: 9, mode: 'each' },
);
```

Sources may be native URI objects, URI/data URI strings, base64 descriptors,
`Blob`, or `ArrayBuffer`. Use `mode: 'batch'` for one Method containing all
files. Batch mode reports only transport-wide progress; it does not invent
per-file byte progress when Fetch cannot provide it. `createLocalLink` can be
injected for non-URI previews.
