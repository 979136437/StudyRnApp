import { QueryClientProvider } from '@tanstack/react-query';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRequest } from '../api/create-request';
import { getRuntime } from '../core/runtime';
import { usePagination } from '../react/use-pagination';
import { useRequest } from '../react/use-request';
import type { PaginationResult, UseRequestResult } from '../types';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('request hooks', () => {
  it('exposes loading, data, events, and manual updates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ id: 1, title: 'Todo' })),
    );
    const request = createRequest();
    const method = request.Get<{ id: number; title: string }>(
      'https://api.test/todo',
    );
    const queryClient = getRuntime(request).queryClient;
    let hook: UseRequestResult<{ id: number; title: string }> | undefined;
    let renderer: ReactTestRenderer;

    function Fixture() {
      hook = useRequest(method);
      return null;
    }

    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <Fixture />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await method.send();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(hook?.data?.title).toBe('Todo');
    expect(hook?.loading).toBe(false);

    act(() => {
      hook?.update({
        data: (current) =>
          current === undefined ? current : { ...current, title: 'Updated' },
      });
    });
    expect(hook?.data?.title).toBe('Updated');
    act(() => {
      renderer!.unmount();
      queryClient.clear();
    });
  });

  it('supports pagination actions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ data: [{ id: 1 }], total: 1 })),
    );
    const request = createRequest();
    const queryClient = getRuntime(request).queryClient;
    let pagination: PaginationResult<{ id: number }> | undefined;
    let renderer: ReactTestRenderer;
    const handler = (page: number, pageSize: number) =>
      request.Get<{ data: { id: number }[]; total: number }>(
        'https://api.test/todos',
        { params: { page, pageSize } },
      );

    function Fixture() {
      pagination = usePagination(handler, {
        data: (response) => response.data,
        preloadNextPage: false,
        preloadPreviousPage: false,
        total: (response) => response.total,
      });
      return null;
    }

    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <Fixture />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await handler(1, 10).send();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(pagination?.data).toEqual([{ id: 1 }]);

    await act(async () => pagination?.insert({ id: 2 }));
    expect(pagination?.data).toEqual([{ id: 2 }, { id: 1 }]);
    await act(async () => pagination?.replace({ id: 3 }, 0));
    expect(pagination?.data[0]).toEqual({ id: 3 });
    await act(async () => pagination?.remove(0));
    expect(pagination?.data).toEqual([{ id: 1 }]);
    act(() => {
      renderer!.unmount();
      queryClient.clear();
    });
  });
});

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
