import {
  cloneElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { resolveTabTargetOffset, validateTabKeys } from './core/tabState';
import type { InternalTabSceneProps } from './RecyclerList';
import type {
  RecyclerTabItem,
  RecyclerTabViewProps,
} from './RecyclerTabView.types';
import type { RecyclerListProps, RecyclerListRef } from './types';

const DEFAULT_TAB_BAR_HEIGHT = 48;

function setRef<T>(ref: React.Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref !== null && ref !== undefined) {
    ref.current = value;
  }
}

export function RecyclerTabView<TTab extends RecyclerTabItem>({
  tabs,
  renderHeader,
  renderScene,
  renderTabBar,
  activeKey: controlledActiveKey,
  defaultActiveKey,
  onActiveKeyChange,
  collapsedHeaderHeight = 0,
  style,
  testID,
}: RecyclerTabViewProps<TTab>): ReactElement {
  const keys = useMemo(() => validateTabKeys(tabs), [tabs]);
  const initialKey = defaultActiveKey ?? keys[0] ?? '';
  const [uncontrolledActiveKey, setUncontrolledActiveKey] =
    useState(initialKey);
  const activeKey = controlledActiveKey ?? uncontrolledActiveKey;
  const activeIndex = Math.max(0, keys.indexOf(activeKey));
  const pagerRef = useRef<PagerView>(null);
  const listRefs = useRef(new Map<string, RecyclerListRef>());
  const savedOffsets = useRef(new Map<string, number>());
  const coordinatorId = useRef(
    `nitro-recycler-tabs-${Math.random().toString(36).slice(2)}`,
  ).current;
  const [headerHeight, setHeaderHeight] = useState(0);
  const [tabBarHeight, setTabBarHeight] = useState(DEFAULT_TAB_BAR_HEIGHT);
  const collapseOffset = useSharedValue(0);
  const collapseProgress = useSharedValue(0);
  const collapseRange = Math.max(0, headerHeight - collapsedHeaderHeight);

  const selectTab = useCallback(
    (key: string) => {
      const targetIndex = keys.indexOf(key);
      if (targetIndex < 0 || key === activeKey) return;
      const currentOffset =
        listRefs.current.get(activeKey)?.getState().offset ?? 0;
      savedOffsets.current.set(activeKey, currentOffset);
      const collapsedOffset = Math.min(collapseRange, collapseOffset.value);
      const savedTarget = savedOffsets.current.get(key) ?? 0;
      const targetOffset = resolveTabTargetOffset(
        collapsedOffset,
        collapseRange,
        savedTarget,
      );
      listRefs.current.get(key)?.scrollToOffset({
        animated: false,
        offset: targetOffset,
      });
      if (controlledActiveKey === undefined) setUncontrolledActiveKey(key);
      onActiveKeyChange?.(key);
      pagerRef.current?.setPage(targetIndex);
    },
    [
      activeKey,
      collapseOffset,
      collapseRange,
      controlledActiveKey,
      keys,
      onActiveKeyChange,
    ],
  );

  useEffect(() => {
    if (controlledActiveKey === undefined) return;
    const index = keys.indexOf(controlledActiveKey);
    if (index >= 0) pagerRef.current?.setPageWithoutAnimation(index);
  }, [controlledActiveKey, keys]);

  const headerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.min(collapseRange, collapseOffset.value) }],
  }));
  const tabBarStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.min(collapseRange, collapseOffset.value) }],
  }));
  const tabBarContext = useMemo(
    () => ({ tabs, activeKey, selectTab, collapseOffset, collapseProgress }),
    [activeKey, collapseOffset, collapseProgress, selectTab, tabs],
  );

  return (
    <View style={[styles.container, style]} testID={testID}>
      <PagerView
        initialPage={activeIndex}
        onPageSelected={(event) => {
          const key = keys[event.nativeEvent.position];
          if (key !== undefined && key !== activeKey) selectTab(key);
        }}
        ref={pagerRef}
        style={styles.pager}
      >
        {tabs.map((tab) => {
          const scene = renderScene(tab);
          const sceneRef = (
            scene as ReactElement<{
              ref?: React.Ref<RecyclerListRef>;
            }>
          ).props.ref;
          const internalScene: InternalTabSceneProps = {
            active: tab.key === activeKey,
            collapseOffset,
            collapseProgress,
            collapseRange,
            coordinatorId,
            headerSpacerHeight: headerHeight + tabBarHeight,
            tabKey: tab.key,
          };
          return (
            <View collapsable={false} key={tab.key} style={styles.scene}>
              {cloneElement(
                scene as ReactElement<
                  RecyclerListProps<unknown> & {
                    __tabScene?: InternalTabSceneProps;
                    ref?: React.Ref<RecyclerListRef>;
                  }
                >,
                {
                  __tabScene: internalScene,
                  ref: (value: RecyclerListRef | null) => {
                    if (value === null) listRefs.current.delete(tab.key);
                    else listRefs.current.set(tab.key, value);
                    setRef(sceneRef, value);
                  },
                },
              )}
            </View>
          );
        })}
      </PagerView>
      <Animated.View
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        pointerEvents="box-none"
        style={[styles.header, headerStyle]}
      >
        {renderHeader()}
      </Animated.View>
      <Animated.View
        onLayout={(event) => setTabBarHeight(event.nativeEvent.layout.height)}
        style={[styles.tabBar, { top: headerHeight }, tabBarStyle]}
      >
        {renderTabBar?.(tabBarContext) ?? (
          <DefaultTabBar context={tabBarContext} />
        )}
      </Animated.View>
    </View>
  );
}

function DefaultTabBar<TTab extends RecyclerTabItem>({
  context,
}: {
  context: {
    tabs: readonly TTab[];
    activeKey: string;
    selectTab(key: string): void;
  };
}): ReactElement {
  return (
    <View style={styles.defaultTabBar}>
      {context.tabs.map((tab) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: tab.key === context.activeKey }}
          key={tab.key}
          onPress={() => context.selectTab(tab.key)}
          style={styles.defaultTab}
        >
          <Text
            style={[
              styles.defaultTabText,
              tab.key === context.activeKey && styles.defaultTabTextActive,
            ]}
          >
            {tab.title}
          </Text>
          <View
            style={[
              styles.indicator,
              tab.key !== context.activeKey && styles.indicatorHidden,
            ]}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  defaultTab: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  defaultTabBar: {
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    height: 48,
  },
  defaultTabText: { color: '#66766e', fontSize: 13, fontWeight: '600' },
  defaultTabTextActive: { color: '#18221e', fontWeight: '800' },
  header: { left: 0, position: 'absolute', right: 0, top: 0, zIndex: 20 },
  indicator: {
    backgroundColor: '#147d64',
    bottom: 0,
    height: 3,
    left: 18,
    position: 'absolute',
    right: 18,
  },
  indicatorHidden: { opacity: 0 },
  pager: { flex: 1 },
  scene: { flex: 1 },
  tabBar: { left: 0, position: 'absolute', right: 0, zIndex: 21 },
});
