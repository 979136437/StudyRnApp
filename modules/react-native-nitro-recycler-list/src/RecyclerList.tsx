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
import { StyleSheet, View } from 'react-native';
import { callback, type HybridRef } from 'react-native-nitro-modules';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useAnimatedRef,
  useEvent,
  useSharedValue,
} from 'react-native-reanimated';

import { createDescriptors, normalizeListOptions } from './core/descriptors';
import { EndReachedGate } from './core/endReachedGate';
import { readSavedOffset, saveOffset } from './core/scrollState';
import { normalizeSecondLevelOptions } from './core/secondLevel';
import { areSlotBindingsEqual } from './core/slotBindings';
import { logNitroRecyclerTrace } from './core/trace';
import { translateVisibleRange } from './core/visibleRange';
import NativeRecyclerListRefreshEventSource, {
  type RecyclerListRefreshPullEvent,
  type RecyclerListTabScrollEvent,
} from './fabric/NativeRecyclerListRefreshEventSource';
import { NativeRecyclerCellHost } from './native/NativeRecyclerCellHost';
import { NativeRecyclerList } from './native/NativeRecyclerList';
import type {
  ItemDescriptor,
  NativeSecondLevelPhase,
  RecyclerListViewMethods,
  RecyclerListViewProps,
  SlotBinding,
  VisibleRange,
} from './specs/RecyclerList.nitro';
import type {
  RecyclerListProps,
  RecyclerListRef,
  RefreshPhase,
  SecondLevelPhase,
} from './types';

export interface InternalTabSceneProps {
  coordinatorId: string;
  tabKey: string;
  active: boolean;
  collapseRange: number;
  headerSpacerHeight: number;
  collapseOffset: SharedValue<number>;
  collapseProgress: SharedValue<number>;
}

type InternalRecyclerListProps<T> = RecyclerListProps<T> & {
  __tabScene?: InternalTabSceneProps;
};

type InternalEntry<T> =
  | { kind: 'item'; item: T; dataIndex: number; key: string; type: string }
  | {
      kind: 'header' | 'footer' | 'empty' | 'loadMore';
      key: string;
      node: ReactNode;
    };

type DirectEventRegistration = {
  workletEventHandler: {
    registerForEvents(viewTag: number, fallbackEventName?: string): void;
    unregisterFromEvents(viewTag: number): void;
  };
};

const EMPTY_RANGE: VisibleRange = { first: -1, last: -1 };
const EMPTY_STATE = {
  offset: 0,
  contentSize: 0,
  firstVisibleIndex: -1,
  lastVisibleIndex: -1,
  refreshing: false,
  secondLevelOpen: false,
  secondLevelPhase: 'idle' as const,
};

function RecyclerListInner<T>(
  props: InternalRecyclerListProps<T>,
  forwardedRef: React.ForwardedRef<RecyclerListRef>,
): ReactElement {
  const {
    data,
    renderItem,
    keyExtractor,
    getItemType,
    getItemSpan,
    getStickyLevel,
    getStickyGroup,
    ListHeaderComponent,
    ListFooterComponent,
    ListEmptyComponent,
    refreshing = false,
    onRefresh,
    refreshEnabled = true,
    refreshThreshold = 80,
    renderRefreshHeader,
    secondLevel,
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
    __tabScene,
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
  const progress = useSharedValue(0);
  const offset = useSharedValue(0);
  const phaseValue = useSharedValue<RefreshPhase>('idle');
  const secondLevelProgress = useSharedValue(0);
  const secondLevelPhaseValue = useSharedValue<SecondLevelPhase>('idle');
  const phaseRef = useRef<RefreshPhase>('idle');
  const secondLevelPhaseRef = useRef<SecondLevelPhase>('idle');
  const [phase, setPhase] = useState<RefreshPhase>('idle');
  const [secondLevelPhase, setSecondLevelPhase] =
    useState<SecondLevelPhase>('idle');
  const [bindings, setBindings] = useState<SlotBinding[]>([]);
  const handleSlotsChanged = useCallback(
    (nextBindings: SlotBinding[]) => {
      if (__DEV__) {
        logNitroRecyclerTrace(
          'JS slots-received',
          listId,
          nextBindings
            .map(
              (binding) =>
                `${binding.slotId}:${binding.index}:${binding.itemKey}`,
            )
            .join(','),
        );
      }
      setBindings((currentBindings) =>
        areSlotBindingsEqual(currentBindings, nextBindings)
          ? currentBindings
          : nextBindings,
      );
    },
    [listId],
  );

  useEffect(() => {
    if (__DEV__) {
      logNitroRecyclerTrace(
        'JS slots-committed',
        listId,
        bindings
          .map(
            (binding) =>
              `${binding.slotId}:${binding.index}:${binding.itemKey}`,
          )
          .join(','),
      );
    }
  }, [bindings, listId]);

  useEffect(() => {
    if (__DEV__) {
      logNitroRecyclerTrace(
        'JS refresh-prop',
        listId,
        `refreshing=${refreshing}`,
      );
    }
  }, [listId, refreshing]);

  const itemDescriptors = useMemo(
    () =>
      createDescriptors({
        data,
        keyExtractor,
        getItemType,
        getItemSpan,
        getStickyLevel,
        getStickyGroup,
        estimatedItemSize: options.estimatedItemSize,
        layout: options.layout,
        numColumns: options.numColumns,
      }),
    [
      data,
      getItemSpan,
      getItemType,
      getStickyLevel,
      getStickyGroup,
      keyExtractor,
      options.estimatedItemSize,
      options.layout,
      options.numColumns,
    ],
  );
  const normalizedSecondLevel = normalizeSecondLevelOptions(
    refreshThreshold,
    secondLevel,
  );
  const tabHeaderSpacerHeight = __tabScene?.headerSpacerHeight ?? 0;
  const effectiveHeader = useMemo(
    () =>
      tabHeaderSpacerHeight > 0 ? (
        <View>
          <View style={{ height: tabHeaderSpacerHeight }} />
          {ListHeaderComponent}
        </View>
      ) : (
        ListHeaderComponent
      ),
    [ListHeaderComponent, tabHeaderSpacerHeight],
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
        stickyGroup: '',
        estimatedSize: options.estimatedItemSize,
      });
    };

    appendSpecial('header', effectiveHeader);
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
    effectiveHeader,
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
    (range: VisibleRange): VisibleRange =>
      translateVisibleRange(range, data.length, headerCount),
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
      getState: () => {
        const state = nativeRef.current?.getState();
        if (!state) return EMPTY_STATE;
        const range = translateRange({
          first: state.firstVisibleIndex,
          last: state.lastVisibleIndex,
        });
        return {
          ...state,
          firstVisibleIndex: range.first,
          lastVisibleIndex: range.last,
        };
      },
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

  useEffect(() => {
    offset.value = 0;
    progress.value = 0;
    phaseValue.value = 'idle';
    phaseRef.current = 'idle';
    secondLevelProgress.value = 0;
    secondLevelPhaseValue.value = 'idle';
    secondLevelPhaseRef.current = 'idle';
    setPhase('idle');
    setSecondLevelPhase('idle');
  }, [
    listId,
    offset,
    phaseValue,
    progress,
    secondLevelPhaseValue,
    secondLevelProgress,
  ]);

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

  const refreshHeader = useMemo(
    () =>
      renderRefreshHeader?.({
        offset,
        phase,
        phaseValue,
        progress,
        secondLevel: normalizedSecondLevel.enabled
          ? {
              phase: secondLevelPhase,
              phaseValue: secondLevelPhaseValue,
              progress: secondLevelProgress,
              threshold: normalizedSecondLevel.threshold,
            }
          : null,
        threshold: refreshThreshold,
      }),
    [
      offset,
      phase,
      phaseValue,
      progress,
      refreshThreshold,
      renderRefreshHeader,
      normalizedSecondLevel.enabled,
      normalizedSecondLevel.threshold,
      secondLevelPhase,
      secondLevelPhaseValue,
      secondLevelProgress,
    ],
  );
  const refreshHeaderStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: Math.min(offset.value, refreshThreshold) - refreshThreshold,
      },
    ],
  }));
  const pullEventHandler = useEvent<RecyclerListRefreshPullEvent>(
    (event) => {
      'worklet';
      offset.value = Math.max(0, event.offset);
      progress.value = Math.max(0, Math.min(1, event.progress));
      phaseValue.value = event.phase as RefreshPhase;
      secondLevelProgress.value = Math.max(
        0,
        Math.min(1, event.secondLevelProgress),
      );
      secondLevelPhaseValue.value = event.secondLevelPhase as SecondLevelPhase;
    },
    ['onPull'],
  );
  const tabScrollEventHandler = useEvent<RecyclerListTabScrollEvent>(
    (event) => {
      'worklet';
      if (__tabScene !== undefined) {
        const nextOffset = Math.max(
          0,
          Math.min(__tabScene.collapseRange, event.collapseOffset),
        );
        __tabScene.collapseOffset.value = nextOffset;
        __tabScene.collapseProgress.value =
          __tabScene.collapseRange <= 0
            ? 1
            : nextOffset / __tabScene.collapseRange;
      }
    },
    ['onTabScroll'],
  );
  const refreshEventSourceRef = useAnimatedRef();
  const setRefreshEventSourceRef = useCallback(
    (instance: Parameters<typeof refreshEventSourceRef>[0]) => {
      refreshEventSourceRef(instance);
    },
    [refreshEventSourceRef],
  );

  useEffect(() => {
    const eventSourceTag = refreshEventSourceRef.getTag?.();
    if (eventSourceTag == null) return;

    const pullRegistration =
      pullEventHandler as unknown as DirectEventRegistration;
    const tabScrollRegistration =
      tabScrollEventHandler as unknown as DirectEventRegistration;
    pullRegistration.workletEventHandler.registerForEvents(
      eventSourceTag,
      'onPull',
    );
    tabScrollRegistration.workletEventHandler.registerForEvents(
      eventSourceTag,
      'onTabScroll',
    );

    return () => {
      pullRegistration.workletEventHandler.unregisterFromEvents(eventSourceTag);
      tabScrollRegistration.workletEventHandler.unregisterFromEvents(
        eventSourceTag,
      );
    };
  }, [pullEventHandler, refreshEventSourceRef, tabScrollEventHandler]);
  const secondLevelContext = useMemo(
    () => ({
      close: () => secondLevel?.onOpenChange(false),
      offset,
      phase: secondLevelPhase,
      phaseValue: secondLevelPhaseValue,
      progress: secondLevelProgress,
      threshold: normalizedSecondLevel.threshold,
    }),
    [
      normalizedSecondLevel.threshold,
      offset,
      secondLevel,
      secondLevelPhase,
      secondLevelPhaseValue,
      secondLevelProgress,
    ],
  );
  const secondLevelStyle = useAnimatedStyle(() => ({
    opacity:
      secondLevelPhaseValue.value === 'open' ? 1 : secondLevelProgress.value,
  }));

  return (
    <View style={[styles.container, style]} testID={testID}>
      {secondLevel === undefined ? null : (
        <Animated.View
          pointerEvents={secondLevel.open ? 'auto' : 'none'}
          style={[styles.secondLevel, secondLevelStyle]}
        >
          {secondLevel.renderContent(secondLevelContext)}
        </Animated.View>
      )}
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
        onRefreshPhaseChanged={callback((nextPhase) => {
          if (__DEV__) {
            logNitroRecyclerTrace('JS refresh-phase', listId, nextPhase);
          }
          if (phaseRef.current !== nextPhase) {
            phaseRef.current = nextPhase;
            setPhase(nextPhase);
          }
        })}
        onRefreshRequested={callback(() => {
          if (__DEV__) {
            logNitroRecyclerTrace('JS refresh-requested', listId);
          }
          onRefresh?.();
        })}
        onSecondLevelPhaseChanged={callback(
          (nextPhase: NativeSecondLevelPhase) => {
            if (secondLevelPhaseRef.current !== nextPhase) {
              secondLevelPhaseRef.current = nextPhase;
              setSecondLevelPhase(nextPhase);
            }
          },
        )}
        onSecondLevelRequested={callback(() => {
          secondLevel?.onRequested?.();
          secondLevel?.onOpenChange(true);
        })}
        onSlotsChanged={callback(handleSlotsChanged)}
        onVisibleRangeChanged={callback((range) => {
          onVisibleRangeChanged?.(translateRange(range));
        })}
        overscan={options.overscan}
        refreshEnabled={
          (refreshEnabled && onRefresh != null) || normalizedSecondLevel.enabled
        }
        refreshing={refreshing}
        refreshThreshold={Math.max(1, refreshThreshold)}
        secondLevelEnabled={
          normalizedSecondLevel.enabled && !options.horizontal
        }
        secondLevelOpen={normalizedSecondLevel.open}
        secondLevelThreshold={normalizedSecondLevel.threshold}
        tabActive={__tabScene?.active ?? true}
        tabCollapseRange={__tabScene?.collapseRange ?? 0}
        tabCoordinatorId={__tabScene?.coordinatorId ?? ''}
        tabKey={__tabScene?.tabKey ?? ''}
        style={[styles.list, contentContainerStyle]}
      >
        {bindings.map((binding) => {
          const entry = entries[binding.index];
          if (!entry) return null;
          const descriptor = descriptors[binding.index];
          const columnCount = Math.max(1, options.numColumns);
          const columnSpan = Math.min(
            columnCount,
            Math.max(1, descriptor?.span ?? 1),
          );
          const cellWidth =
            `${(columnSpan / columnCount) * 100}%` as `${number}%`;
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
                  ? { minWidth: descriptor?.estimatedSize }
                  : {
                      minHeight: descriptor?.estimatedSize,
                      width: cellWidth,
                    },
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
      <NativeRecyclerListRefreshEventSource
        collapsable={false}
        listId={listId}
        pointerEvents="none"
        ref={setRefreshEventSourceRef}
        style={styles.refreshEventSource}
      />
      {refreshHeader == null ? null : (
        <Animated.View
          pointerEvents="none"
          style={[styles.refreshHeader, refreshHeaderStyle]}
        >
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
  secondLevel: {
    ...StyleSheet.absoluteFill,
    zIndex: 0,
  },
  refreshEventSource: {
    height: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 0,
  },
});

export const RecyclerList = forwardRef(RecyclerListInner) as <T>(
  props: RecyclerListProps<T> & { ref?: React.Ref<RecyclerListRef> },
) => ReactElement;
