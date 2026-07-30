import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { callback, type HybridRef } from 'react-native-nitro-modules';

import { createDescriptors, normalizeListOptions } from './core/descriptors';
import { EndReachedGate } from './core/endReachedGate';
import { readSavedOffset, saveOffset } from './core/scrollState';
import { NativeRecyclerCellHost } from './native/NativeRecyclerCellHost';
import { NativeRecyclerList } from './native/NativeRecyclerList';
import type {
  ItemDescriptor,
  RecyclerListViewMethods,
  RecyclerListViewProps,
  SlotBinding,
  VisibleRange,
} from './specs/RecyclerList.nitro';
import type { RecyclerListProps, RecyclerListRef, RefreshPhase } from './types';

type InternalEntry<T> =
  | { kind: 'item'; item: T; dataIndex: number; key: string; type: string }
  | {
      kind: 'header' | 'footer' | 'empty' | 'loadMore';
      key: string;
      node: ReactNode;
    };

const EMPTY_RANGE: VisibleRange = { first: -1, last: -1 };
const EMPTY_STATE = {
  offset: 0,
  contentSize: 0,
  firstVisibleIndex: -1,
  lastVisibleIndex: -1,
  refreshing: false,
};

function RecyclerListInner<T>(
  props: RecyclerListProps<T>,
  forwardedRef: React.ForwardedRef<RecyclerListRef>,
): ReactElement {
  const {
    data,
    renderItem,
    keyExtractor,
    getItemType,
    getItemSpan,
    getStickyLevel,
    ListHeaderComponent,
    ListFooterComponent,
    ListEmptyComponent,
    refreshing = false,
    onRefresh,
    refreshEnabled = true,
    refreshThreshold = 80,
    renderRefreshHeader,
    onEndReached,
    onEndReachedThreshold = 0.5,
    loadMoreState = 'idle',
    renderLoadMoreFooter,
    onVisibleRangeChanged,
    listKey,
    preserveNestedScrollPosition = true,
    style,
    contentContainerStyle,
    testID,
  } = props;
  const options = normalizeListOptions(props);
  const generatedListId = useRef(
    `nitro-recycler-list-${Math.random().toString(36).slice(2)}`,
  );
  const listId = listKey ?? generatedListId.current;
  const nativeRef = useRef<HybridRef<
    RecyclerListViewProps,
    RecyclerListViewMethods
  > | null>(null);
  const gate = useRef(new EndReachedGate());
  const progress = useRef(new Animated.Value(0)).current;
  const offset = useRef(new Animated.Value(0)).current;
  const [phase, setPhase] = useState<RefreshPhase>('idle');
  const [bindings, setBindings] = useState<SlotBinding[]>([]);

  const itemDescriptors = useMemo(
    () =>
      createDescriptors({
        data,
        keyExtractor,
        getItemType,
        getItemSpan,
        getStickyLevel,
        estimatedItemSize: options.estimatedItemSize,
        layout: options.layout,
        numColumns: options.numColumns,
      }),
    [
      data,
      getItemSpan,
      getItemType,
      getStickyLevel,
      keyExtractor,
      options.estimatedItemSize,
      options.layout,
      options.numColumns,
    ],
  );

  const loadMoreNode = renderLoadMoreFooter?.({
    state: loadMoreState,
    retry: () => {
      gate.current.retry();
      nativeRef.current?.retryEndReached();
    },
  });

  const { entries, descriptors, headerCount } = useMemo(() => {
    const nextEntries: InternalEntry<T>[] = [];
    const nextDescriptors: ItemDescriptor[] = [];

    const appendSpecial = (
      kind: 'header' | 'footer' | 'empty' | 'loadMore',
      node: ReactNode,
    ) => {
      if (node == null || node === false) return;
      const key = `__nitro_${kind}__`;
      nextEntries.push({ kind, key, node });
      nextDescriptors.push({
        key,
        type: key,
        span: options.numColumns,
        stickyLevel: -1,
        estimatedSize: options.estimatedItemSize,
      });
    };

    appendSpecial('header', ListHeaderComponent);
    const nextHeaderCount = nextEntries.length;

    if (data.length === 0) {
      appendSpecial('empty', ListEmptyComponent);
    } else {
      itemDescriptors.forEach((descriptor, dataIndex) => {
        nextEntries.push({
          kind: 'item',
          item: data[dataIndex]!,
          dataIndex,
          key: descriptor.key,
          type: descriptor.type,
        });
        nextDescriptors.push(descriptor);
      });
    }

    appendSpecial('footer', ListFooterComponent);
    appendSpecial('loadMore', loadMoreNode);
    return {
      entries: nextEntries,
      descriptors: nextDescriptors,
      headerCount: nextHeaderCount,
    };
  }, [
    ListEmptyComponent,
    ListFooterComponent,
    ListHeaderComponent,
    data,
    itemDescriptors,
    loadMoreNode,
    options.estimatedItemSize,
    options.numColumns,
  ]);

  const dataVersion = useMemo(
    () => itemDescriptors.map((item) => item.key).join('\u001f'),
    [itemDescriptors],
  );

  const handleEndReached = useCallback(() => {
    const enabled = loadMoreState === 'idle' || loadMoreState === 'error';
    if (gate.current.shouldFire(dataVersion, enabled)) {
      onEndReached?.();
    }
  }, [dataVersion, loadMoreState, onEndReached]);

  const translateRange = useCallback(
    (range: VisibleRange): VisibleRange => {
      if (data.length === 0 || range.first < 0 || range.last < 0) {
        return EMPTY_RANGE;
      }
      return {
        first: Math.max(
          0,
          Math.min(data.length - 1, range.first - headerCount),
        ),
        last: Math.max(0, Math.min(data.length - 1, range.last - headerCount)),
      };
    },
    [data.length, headerCount],
  );

  useImperativeHandle(
    forwardedRef,
    () => ({
      scrollToOffset: ({ offset: nextOffset, animated = true }) =>
        nativeRef.current?.scrollToOffset(nextOffset, animated),
      scrollToIndex: ({ index, viewPosition = 0, animated = true }) => {
        if (index < 0 || index >= data.length) {
          throw new RangeError(
            `[react-native-nitro-recycler-list] scrollToIndex 索引越界：${index}`,
          );
        }
        nativeRef.current?.scrollToIndex(
          index + headerCount,
          viewPosition,
          animated,
        );
      },
      scrollToEnd: ({ animated = true } = {}) =>
        nativeRef.current?.scrollToEnd(animated),
      getVisibleRange: () =>
        nativeRef.current
          ? translateRange(nativeRef.current.getVisibleRange())
          : EMPTY_RANGE,
      retryEndReached: () => {
        gate.current.retry();
        nativeRef.current?.retryEndReached();
      },
      getState: () => nativeRef.current?.getState() ?? EMPTY_STATE,
    }),
    [data.length, headerCount, translateRange],
  );

  useEffect(
    () => () => {
      if (preserveNestedScrollPosition && listKey && nativeRef.current) {
        saveOffset(listKey, nativeRef.current.getState().offset);
      }
    },
    [listKey, preserveNestedScrollPosition],
  );

  const handleHybridRef = useCallback(
    (ref: HybridRef<RecyclerListViewProps, RecyclerListViewMethods>) => {
      nativeRef.current = ref;
      if (preserveNestedScrollPosition && listKey) {
        const savedOffset = readSavedOffset(listKey);
        if (savedOffset > 0) ref.scrollToOffset(savedOffset, false);
      }
    },
    [listKey, preserveNestedScrollPosition],
  );

  const refreshHeader = renderRefreshHeader?.({
    phase,
    progress,
    offset,
    threshold: refreshThreshold,
  });

  return (
    <View style={[styles.container, style]} testID={testID}>
      <NativeRecyclerList
        descriptors={descriptors}
        endReachedEnabled={
          onEndReached != null &&
          loadMoreState !== 'loading' &&
          loadMoreState !== 'finished'
        }
        endReachedThreshold={Math.max(0, onEndReachedThreshold)}
        horizontal={options.horizontal}
        hybridRef={callback(handleHybridRef)}
        layout={options.layout}
        listId={listId}
        numColumns={options.numColumns}
        onEndReached={callback(handleEndReached)}
        onRefreshProgress={callback((nextPhase, nextOffset, nextProgress) => {
          offset.setValue(nextOffset);
          progress.setValue(nextProgress);
          setPhase(nextPhase);
        })}
        onRefreshRequested={callback(() => onRefresh?.())}
        onSlotsChanged={callback(setBindings)}
        onVisibleRangeChanged={callback((range) => {
          onVisibleRangeChanged?.(translateRange(range));
        })}
        overscan={options.overscan}
        refreshEnabled={refreshEnabled && onRefresh != null}
        refreshing={refreshing}
        refreshThreshold={Math.max(1, refreshThreshold)}
        style={[styles.list, contentContainerStyle]}
      >
        {bindings.map((binding) => {
          const entry = entries[binding.index];
          if (!entry) return null;
          return (
            <NativeRecyclerCellHost
              itemKey={entry.key}
              itemType={binding.itemType}
              key={binding.slotId}
              listId={listId}
              slotId={binding.slotId}
              style={[
                styles.cell,
                options.horizontal
                  ? { minWidth: descriptors[binding.index]?.estimatedSize }
                  : { minHeight: descriptors[binding.index]?.estimatedSize },
              ]}
            >
              <View
                key={entry.key}
                collapsable={false}
                onLayout={(event) => {
                  const { width, height } = event.nativeEvent.layout;
                  nativeRef.current?.updateMeasuredSize(
                    entry.key,
                    width,
                    height,
                  );
                }}
              >
                {entry.kind === 'item'
                  ? renderItem({
                      item: entry.item,
                      index: entry.dataIndex,
                      itemKey: entry.key,
                      itemType: entry.type,
                    })
                  : entry.node}
              </View>
            </NativeRecyclerCellHost>
          );
        })}
      </NativeRecyclerList>
      {refreshHeader == null ? null : (
        <Animated.View pointerEvents="none" style={styles.refreshHeader}>
          {refreshHeader}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    width: '100%',
  },
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  list: {
    flex: 1,
  },
  refreshHeader: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10,
  },
});

export const RecyclerList = forwardRef(RecyclerListInner) as <T>(
  props: RecyclerListProps<T> & { ref?: React.Ref<RecyclerListRef> },
) => ReactElement;
