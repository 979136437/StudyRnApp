# react-native-request-kit

An alova-style request layer for React Native and Expo, powered internally by
Ky and TanStack Query.

## Create a request instance

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createAsyncStoragePersister,
  createRequest,
  RequestProvider,
} from 'react-native-request-kit';

export const request = createRequest({
  baseUrl: process.env.EXPO_PUBLIC_API_URL,
  timeout: 15_000,
  headers: {
    Accept: 'application/json',
  },
  beforeRequest: async (original) => {
    const headers = new Headers(original.headers);
    const token = await readTokenFromSecureStorage();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return new Request(original, { headers });
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
import { useRequest, useWatcher } from 'react-native-request-kit';

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
} from 'react-native-request-kit';

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
import { useAutoRequest } from 'react-native-request-kit';

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
import {
  createRequest,
  createServerTokenAuthentication,
} from 'react-native-request-kit';

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
import { useUploader } from 'react-native-request-kit';

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
