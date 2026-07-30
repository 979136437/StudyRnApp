import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type ReactElement,
} from 'react';
import { FlatList, type FlatList as FlatListType } from 'react-native';

import type { RecyclerListProps, RecyclerListRef } from './types';

function RecyclerListWebInner<T>(
  props: RecyclerListProps<T>,
  ref: React.ForwardedRef<RecyclerListRef>,
): ReactElement {
  const listRef = useRef<FlatListType<T>>(null);
  const {
    data,
    renderItem,
    keyExtractor,
    getItemType,
    ListHeaderComponent,
    ListFooterComponent,
    ListEmptyComponent,
    refreshing = false,
    onRefresh,
    onEndReached,
    onEndReachedThreshold = 0.5,
    horizontal = false,
    layout = 'list',
    numColumns = 2,
    style,
    contentContainerStyle,
    testID,
  } = props;

  if (__DEV__ && layout === 'masonry') {
    console.warn(
      '[react-native-nitro-recycler-list] Web 将 masonry 降级为普通多列布局。',
    );
  }

  useImperativeHandle(ref, () => ({
    scrollToOffset: ({ offset, animated = true }) =>
      listRef.current?.scrollToOffset({ offset, animated }),
    scrollToIndex: ({ index, viewPosition = 0, animated = true }) =>
      listRef.current?.scrollToIndex({ index, viewPosition, animated }),
    scrollToEnd: ({ animated = true } = {}) =>
      listRef.current?.scrollToEnd({ animated }),
    getVisibleRange: () => ({ first: -1, last: -1 }),
    retryEndReached: () => onEndReached?.(),
    getState: () => ({
      offset: 0,
      contentSize: 0,
      firstVisibleIndex: -1,
      lastVisibleIndex: -1,
      refreshing,
      secondLevelOpen: false,
      secondLevelPhase: 'idle',
    }),
  }));

  return (
    <FlatList
      ListEmptyComponent={ListEmptyComponent as ReactElement | null}
      ListFooterComponent={ListFooterComponent as ReactElement | null}
      ListHeaderComponent={ListHeaderComponent as ReactElement | null}
      contentContainerStyle={contentContainerStyle}
      data={data as T[]}
      horizontal={horizontal}
      keyExtractor={keyExtractor}
      numColumns={!horizontal && layout !== 'list' ? numColumns : 1}
      onEndReached={onEndReached}
      onEndReachedThreshold={onEndReachedThreshold}
      onRefresh={onRefresh}
      ref={listRef}
      refreshing={refreshing}
      renderItem={({ item, index }) =>
        renderItem({
          item,
          index,
          itemKey: keyExtractor(item, index),
          itemType: String(getItemType?.(item, index) ?? 'default'),
        })
      }
      style={style}
      testID={testID}
    />
  );
}

export const RecyclerList = forwardRef(RecyclerListWebInner) as <T>(
  props: RecyclerListProps<T> & { ref?: React.Ref<RecyclerListRef> },
) => ReactElement;
