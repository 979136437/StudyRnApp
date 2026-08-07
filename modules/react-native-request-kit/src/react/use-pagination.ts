import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Method } from '../core/method';
import type { HookConfig, PaginationConfig, PaginationResult } from '../types';
import { useRequest } from './use-request';

export function usePagination<TResponse, TRow>(
  handler: (page: number, pageSize: number) => Method<TResponse>,
  config: PaginationConfig<TResponse, TRow> = {},
): PaginationResult<TRow> {
  const [page, setPage] = useState(config.initialPage ?? 1);
  const [pageSize, setPageSize] = useState(config.initialPageSize ?? 10);
  const [rows, setRows] = useState<readonly TRow[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<PaginationResult<TRow>['status']>('');
  const [removing, setRemoving] = useState<readonly number[]>([]);
  const [replacing, setReplacing] = useState<number>();
  const configRef = useRef(config);
  configRef.current = config;
  const method = useMemo(
    () => handler(page, pageSize),
    [handler, page, pageSize],
  );
  const hookConfig: HookConfig<TResponse> = {
    force: config.force,
    immediate: config.immediate,
    initialData: config.initialData,
    managedStates: config.managedStates,
    middleware: config.middleware,
  };
  const request = useRequest(method, hookConfig);
  useEffect(() => {
    if (request.data === undefined) {
      return;
    }
    const selectRows = configRef.current.data ?? defaultRows<TResponse, TRow>;
    const selectTotal = configRef.current.total ?? defaultTotal<TResponse>;
    const nextRows = selectRows(request.data);
    setRows((current) =>
      configRef.current.append && page > (configRef.current.initialPage ?? 1)
        ? [...current, ...nextRows]
        : [...nextRows],
    );
    setTotal(selectTotal(request.data));
  }, [page, request.data]);

  useEffect(() => {
    if (request.data === undefined || request.fetching) {
      return;
    }
    if (config.preloadPreviousPage !== false && page > 1) {
      void handler(page - 1, pageSize).send();
    }
    if (
      config.preloadNextPage !== false &&
      (total === 0 || page * pageSize < total)
    ) {
      void handler(page + 1, pageSize).send();
    }
  }, [
    config.preloadNextPage,
    config.preloadPreviousPage,
    handler,
    page,
    pageSize,
    request.data,
    request.fetching,
    total,
  ]);

  const insert = useCallback(
    async (item: TRow, indexOrItem: number | TRow = 0) => {
      setStatus('inserting');
      try {
        await config.actions?.insert?.(item);
        setRows((current) => {
          const index =
            typeof indexOrItem === 'number'
              ? normalizeIndex(indexOrItem, current.length, true)
              : current.indexOf(indexOrItem) + 1;
          if (index < 0) {
            throw new Error('The reference item was not found');
          }
          const next = [...current];
          next.splice(index, 0, item);
          return next;
        });
        setTotal((current) => current + 1);
      } finally {
        setStatus('');
      }
    },
    [config.actions],
  );

  const remove = useCallback(
    async (...positions: (number | TRow)[]) => {
      const indexes = positions.map((position) =>
        typeof position === 'number'
          ? normalizeIndex(position, rows.length)
          : rows.indexOf(position),
      );
      if (indexes.some((index) => index < 0 || index >= rows.length)) {
        throw new Error('A list item to remove was not found');
      }
      setStatus('removing');
      setRemoving(indexes);
      try {
        await Promise.all(
          indexes.map((index) => config.actions?.remove?.(rows[index]!)),
        );
        const removed = new Set(indexes);
        setRows((current) =>
          current.filter((_item, index) => !removed.has(index)),
        );
        setTotal((current) => Math.max(0, current - removed.size));
      } finally {
        setRemoving([]);
        setStatus('');
      }
    },
    [config.actions, rows],
  );

  const replace = useCallback(
    async (item: TRow, position: number | TRow) => {
      const index =
        typeof position === 'number'
          ? normalizeIndex(position, rows.length)
          : rows.indexOf(position);
      if (index < 0 || index >= rows.length) {
        throw new Error('The list item to replace was not found');
      }
      setStatus('replacing');
      setReplacing(index);
      try {
        await config.actions?.replace?.(item);
        setRows((current) =>
          current.map((currentItem, currentIndex) =>
            currentIndex === index ? item : currentItem,
          ),
        );
      } finally {
        setReplacing(undefined);
        setStatus('');
      }
    },
    [config.actions, rows],
  );

  const refresh = useCallback(
    async (pageOrItem?: number | TRow) => {
      const targetPage =
        typeof pageOrItem === 'number'
          ? pageOrItem
          : pageOrItem === undefined
            ? page
            : Math.floor(rows.indexOf(pageOrItem) / pageSize) + 1;
      if (targetPage < 1) {
        throw new Error('The list item to refresh was not found');
      }
      const response = await handler(targetPage, pageSize).send(true);
      if (targetPage === page) {
        request.update({ data: response });
      }
      return response;
    },
    [handler, page, pageSize, request, rows],
  );

  const reload = useCallback(async () => {
    const firstPage = config.initialPage ?? 1;
    setRows([]);
    setPage(firstPage);
    const response = await handler(firstPage, pageSize).send(true);
    request.update({ data: response });
  }, [config.initialPage, handler, pageSize, request]);

  const update = useCallback(
    (states: { data?: readonly TRow[]; page?: number; pageSize?: number }) => {
      if (states.data !== undefined) {
        setRows(states.data);
      }
      if (states.page !== undefined) {
        setPage(states.page);
      }
      if (states.pageSize !== undefined) {
        setPageSize(states.pageSize);
      }
    },
    [],
  );

  const pageCount = total > 0 ? Math.ceil(total / pageSize) : 0;
  return {
    ...request,
    data: rows,
    insert,
    isLastPage: pageCount > 0 ? page >= pageCount : rows.length < pageSize,
    page,
    pageCount,
    pageSize,
    refresh,
    reload,
    remove,
    removing,
    replace,
    replacing,
    status: request.loading ? 'loading' : status,
    total,
    update,
  } as PaginationResult<TRow>;
}

function defaultRows<TResponse, TRow>(response: TResponse): readonly TRow[] {
  const value = response as { data?: readonly TRow[] };
  return value.data ?? [];
}

function defaultTotal<TResponse>(response: TResponse): number {
  const value = response as { total?: number };
  return value.total ?? 0;
}

function normalizeIndex(
  index: number,
  length: number,
  allowEnd = false,
): number {
  const normalized = index < 0 ? length + index : index;
  return Math.min(normalized, allowEnd ? length : Math.max(0, length - 1));
}
