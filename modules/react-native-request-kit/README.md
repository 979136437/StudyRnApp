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
