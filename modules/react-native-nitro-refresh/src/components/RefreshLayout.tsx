import {
  cloneElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { NitroModules } from 'react-native-nitro-modules';
import Animated, {
  useAnimatedStyle,
  useEvent,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { DEFAULT_REFRESH_DRAG_RATE } from '../constants';
import { identifyRefreshChildren } from '../core/children';
import {
  ControlledRefreshCoordinator,
  isMaxStageEnabled,
  RefreshStateCoordinator,
  resolveRefreshHeaderHeight,
  resolveRefreshMaxDistance,
} from '../core/refresh-state';
import NativeNitroRefreshControl, {
  type NativeProps,
  type RefreshPullEvent,
} from '../fabric/NativeNitroRefreshControl';
import {
  INITIAL_REFRESH_STATE,
  RefreshAnimationProvider,
} from '../react/refresh-animation-context';
import type { RefreshController } from '../specs/RefreshController.nitro';
import {
  RefreshState,
  type RefreshLayoutProps,
  type RefreshOffsetEvent,
  type RefreshState as RefreshStateValue,
} from '../types';

const AnimatedNativeRefreshControl = Animated.createAnimatedComponent(
  NativeNitroRefreshControl,
);

export function RefreshLayout(
  props: RefreshLayoutProps,
): React.JSX.Element | null {
  const {
    children,
    enable = true,
    header: headerProp,
    maxDistance: maxDistanceProp,
    onChangeOffset,
    onEnd,
    onIdle,
    onMax,
    onPulling,
    onRefreshing,
    refreshing,
    style,
    ...viewProps
  } = props;
  const { header, scrollable } = identifyRefreshChildren(headerProp, children);
  const flattenedHeaderStyle = StyleSheet.flatten(header.props.style);
  const headerHeight = resolveRefreshHeaderHeight(
    flattenedHeaderStyle?.height,
    __DEV__ ? console.warn : undefined,
  );
  const maxDistance = resolveRefreshMaxDistance(
    maxDistanceProp,
    headerHeight,
    __DEV__ ? console.warn : undefined,
  );
  // 默认最大距离与刷新阈值一致，但不改变既有四阶段语义。只有调用方显式提供更大
  // 距离时才启用 Max，避免普通刷新在达到第一阈值时同时发布两个状态。
  const hasMaxStage = isMaxStageEnabled(maxDistanceProp, headerHeight);

  // HybridObject 与 Fabric 视图通过稳定 id 配对，组件生命周期内不能重新创建。
  const [controller] = useState(() =>
    NitroModules.createHybridObject<RefreshController>('RefreshController'),
  );
  const [state, setState] = useState<RefreshStateValue>(INITIAL_REFRESH_STATE);
  const [refreshRequestVersion, setRefreshRequestVersion] = useState(0);
  const offset = useSharedValue(0);
  const progress = useSharedValue(0);
  const stateValue = useSharedValue<RefreshStateValue>(INITIAL_REFRESH_STATE);
  const hasRefreshed = useSharedValue<boolean>(false);
  const hasReachedMax = useSharedValue<boolean>(false);
  const offsetCallbackRef = useRef(onChangeOffset);
  const [stateCoordinator] = useState(
    () =>
      new RefreshStateCoordinator({
        onEnd,
        onIdle,
        onMax,
        onPulling,
        onRefreshing,
      }),
  );
  const [controlledCoordinator] = useState(
    () => new ControlledRefreshCoordinator(),
  );

  useEffect(() => {
    // 提交完成后再更新可变回调容器，避免并发渲染被丢弃时泄漏尚未提交的属性。
    offsetCallbackRef.current = onChangeOffset;
    stateCoordinator.updateCallbacks({
      onEnd,
      onIdle,
      onMax,
      onPulling,
      onRefreshing,
    });
  }, [
    onChangeOffset,
    onEnd,
    onIdle,
    onMax,
    onPulling,
    onRefreshing,
    stateCoordinator,
  ]);

  useEffect(() => {
    controller.setOnRefresh(() => {
      // 用户松手后强制再同步一次受控值。若调用方没有在 onRefreshing 中把属性改为
      // true，这次提交会立即结束原生刷新，行为与 React Native 受控 RefreshControl 一致。
      setRefreshRequestVersion((version) => version + 1);
    });
    controller.setOnStateChange((phase) => {
      const nextState = stateCoordinator.accept(phase);
      if (nextState !== undefined) {
        setState(nextState);
      }
    });
    return () => controller.clearCallbacks();
  }, [controller, stateCoordinator]);

  useEffect(() => {
    const nextValue = controlledCoordinator.next(
      enable,
      refreshing,
      refreshRequestVersion > 0,
    );
    if (nextValue !== undefined) {
      controller.setRefreshing(nextValue);
    }
  }, [
    controlledCoordinator,
    controller,
    enable,
    refreshing,
    refreshRequestVersion,
  ]);

  const dispatchOffset = useCallback((nextOffset: number) => {
    offsetCallbackRef.current?.({
      nativeEvent: { offset: nextOffset },
    } as RefreshOffsetEvent);
  }, []);
  const hasOffsetCallback = onChangeOffset !== undefined;
  const dispatchDerivedState = useCallback(
    (nextState: RefreshStateValue) => {
      const acceptedState = stateCoordinator.acceptState(nextState);
      if (acceptedState !== undefined) {
        setState(acceptedState);
      }
    },
    [stateCoordinator],
  );

  // Fabric 直接事件先在界面线程更新 SharedValue。只有调用方显式监听 offset 时，才会
  // 额外通过 scheduleOnRN 构造并发送符合上游形状的 JavaScript 事件。
  const pullEventHandler = useEvent<RefreshPullEvent>(
    (event) => {
      'worklet';
      offset.value = event.offset;
      progress.value = Math.max(0, Math.min(1, event.progress));

      switch (event.phase) {
        case 'ready':
          stateValue.value = RefreshState.Pulling;
          break;
        case 'refreshing':
          hasRefreshed.value = true;
          stateValue.value = RefreshState.Refreshing;
          break;
        case 'settling':
          stateValue.value = hasRefreshed.value
            ? RefreshState.End
            : RefreshState.Idle;
          break;
        case 'idle':
          hasRefreshed.value = false;
          stateValue.value = RefreshState.Idle;
          break;
        default:
          stateValue.value = RefreshState.Idle;
      }

      if (hasMaxStage && event.phase === 'ready') {
        const reachedMax = event.offset >= maxDistance;
        if (reachedMax !== hasReachedMax.value) {
          hasReachedMax.value = reachedMax;
          const nextState = reachedMax
            ? RefreshState.Max
            : RefreshState.Pulling;
          stateValue.value = nextState;
          scheduleOnRN(dispatchDerivedState, nextState);
        } else if (reachedMax) {
          stateValue.value = RefreshState.Max;
        }
      } else if (hasReachedMax.value) {
        hasReachedMax.value = false;
        // 离开二级阈值时由同一 Fabric 事件发布目标状态，避免 Nitro 回调与界面线程
        // 事件到达 JavaScript 的先后顺序不同而残留 Max。
        scheduleOnRN(dispatchDerivedState, stateValue.value);
      }

      if (hasOffsetCallback) {
        scheduleOnRN(dispatchOffset, event.offset);
      }
    },
    ['onPull'],
  );

  const headerStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: Math.min(offset.value, headerHeight) - headerHeight,
      },
    ],
  }));
  const animationContext = useMemo(
    () => ({ headerHeight, offset, progress, state, stateValue }),
    [headerHeight, offset, progress, state, stateValue],
  );
  const renderedHeader = (
    <RefreshAnimationProvider value={animationContext}>
      {cloneElement(header, {
        style: [header.props.style, { height: headerHeight }],
      })}
    </RefreshAnimationProvider>
  );
  const nativeControl = (
    <AnimatedNativeRefreshControl
      controllerId={controller.id}
      dragRate={DEFAULT_REFRESH_DRAG_RATE}
      enabled={enable}
      headerHeight={headerHeight}
      limit={maxDistance}
      onPull={pullEventHandler as unknown as NativeProps['onPull']}
      threshold={headerHeight}
    />
  );

  if (Platform.OS === 'ios') {
    return cloneElement(
      nativeControl,
      { style: [style, styles.iosControl], ...viewProps },
      <View
        pointerEvents="none"
        style={[styles.iosHeader, { top: -headerHeight }]}
      >
        {renderedHeader}
      </View>,
    );
  }

  if (scrollable == null) {
    if (__DEV__) {
      console.error(
        '[react-native-nitro-refresh] RefreshLayout 必须通过纵向滚动组件的 refreshControl 属性使用。',
      );
    }
    return null;
  }

  return (
    <View {...viewProps} style={[styles.container, style]}>
      <Animated.View
        pointerEvents="none"
        style={[styles.androidHeader, headerStyle]}
      >
        {renderedHeader}
      </Animated.View>
      {cloneElement(nativeControl, { style: styles.nativeControl }, scrollable)}
    </View>
  );
}

const styles = StyleSheet.create({
  androidHeader: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1,
  },
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  iosControl: {
    height: 0,
    left: 0,
    overflow: 'visible',
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1,
  },
  iosHeader: {
    left: 0,
    position: 'absolute',
    right: 0,
  },
  nativeControl: {
    flex: 1,
  },
});
