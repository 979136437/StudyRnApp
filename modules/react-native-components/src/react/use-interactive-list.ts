import { useCallback, useMemo } from 'react';

import type {
  InteractiveListScrollHandle,
  UseInteractiveListResult,
} from '../components/InteractiveList/types';
import { useInteractiveListContext } from './interactive-list-context';

export function useInteractiveList<T>(): UseInteractiveListResult<T> {
  const context = useInteractiveListContext();
  const { getItemKey, setListRef } = context;
  const keyExtractor = useCallback(
    (item: T, index: number) => getItemKey(item, index),
    [getItemKey],
  );
  const listRef = useCallback(
    (handle: InteractiveListScrollHandle | null) => setListRef(handle),
    [setListRef],
  );

  return useMemo(
    () => ({
      data: context.data as readonly T[],
      dragRenderDistance: context.dragRenderDistance,
      extraData: {
        activeKey: context.activeKey,
        commitRevision: context.commitRevision,
        offsets: context.offsets,
      },
      isDragging: context.activeKey !== undefined,
      keyExtractor,
      listRef,
      onScroll: context.onScroll,
      onScrollBeginDrag: context.onScrollBeginDrag,
      scrollEventThrottle: 16 as const,
    }),
    [context, keyExtractor, listRef],
  );
}
