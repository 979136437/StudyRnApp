# react-native-request-strategy

A small request strategy layer for React Native and Expo applications. It combines:

- `ky` for transport and request hooks.
- TanStack Query for request state, retries, deduplication, and cache sync.
- AsyncStorage persistence with cache versioning.
- Declarative query and mutation strategies.

## Setup

Create one runtime at module scope and mount its provider once near the app root.

```tsx
import {
  createRequestStrategy,
  RequestStrategyProvider,
} from 'react-native-request-strategy';

export const request = createRequestStrategy({
  baseUrl: process.env.EXPO_PUBLIC_API_URL,
  persistence: {
    buster: '1',
  },
});

export function AppProviders({ children }: React.PropsWithChildren) {
  return (
    <RequestStrategyProvider runtime={request}>
      {children}
    </RequestStrategyProvider>
  );
}
```

## Define strategies

```tsx
import { useMutation, useQuery } from '@tanstack/react-query';

const todoKeys = {
  all: ['todos'] as const,
  page: (page: number) => [...todoKeys.all, { page }] as const,
};

export const todoPage = request.query<TodoPage, { page: number }>({
  queryKey: ({ page }) => todoKeys.page(page),
  request: ({ client, params, signal }) =>
    client.get('todos', { searchParams: params, signal }).json<TodoPage>(),
});

export const createTodo = request.mutation<Todo, NewTodo>({
  mutationKey: ['todos', 'create'],
  request: ({ client, variables }) =>
    client.post('todos', { json: variables }).json<Todo>(),
  invalidate: () => [todoKeys.all],
});

function TodoScreen() {
  const todos = useQuery(todoPage.options({ page: 1 }));
  const create = useMutation(createTodo.options());
  // Render with todos and create.
}
```

Set `persist: false` on queries containing private or short-lived data. AsyncStorage is unencrypted and must not be used for credentials or secrets.

Call `request.clear()` when a user signs out to remove both memory and persisted query data. A query strategy also exposes `cancel(params)` for explicit cancellation in addition to React Query's automatic cancellation.
