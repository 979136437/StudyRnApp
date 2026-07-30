import {
  cloneElement,
  forwardRef,
  type ReactElement,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type LayoutChangeEvent,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { NitroModules } from 'react-native-nitro-modules';
import Animated, {
  useAnimatedStyle,
  useEvent,
  useSharedValue,
} from 'react-native-reanimated';

import {
  DefaultRefreshHeader,
  DEFAULT_REFRESH_HEADER_HEIGHT,
} from './DefaultRefreshHeader';
import NativeNitroRefreshControl, {
  type NativeProps,
  type RefreshPullEvent,
} from './fabric/NativeNitroRefreshControl';
import type { RefreshController } from './specs/RefreshController.nitro';
import {
  RefreshPhase,
  type RefreshControlProps,
  type RefreshControlRef,
  type RefreshHeaderContext,
} from './types';

const DEFAULT_THRESHOLD = 80;
const DEFAULT_DRAG_RATE = 1;
const DEFAULT_TIMEOUT = 800;
const HEADER_HEIGHT_EPSILON = 0.5;
const AnimatedNativeRefreshControl = Animated.createAnimatedComponent(
  NativeNitroRefreshControl,
);

type ScrollableProps = {
  horizontal?: boolean | null;
  inverted?: boolean | null;
};

type InjectedRefreshControlProps = RefreshControlProps & {
  children?: ReactElement<ScrollableProps> | null;
};

/**
 * 校验所有参与原生布局计算的正数参数。
 * 生产环境静默使用安全值，开发环境额外警告，避免非法尺寸传入原生层。
 */
function positiveOrDefault(
  name: string,
  value: number | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (Number.isFinite(value) && value > 0) {
    return value;
  }
  if (__DEV__) {
    console.warn(
      `[react-native-nitro-refresh] ${name} 必须是大于 0 的有限数值，已回退为 ${fallback}。`,
    );
  }
  return fallback;
}

/** 校验允许为 0 的持续时间参数。 */
function nonNegativeOrDefault(
  name: string,
  value: number | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (__DEV__) {
    console.warn(
      `[react-native-nitro-refresh] ${name} 必须是大于等于 0 的有限数值，已回退为 ${fallback}。`,
    );
  }
  return fallback;
}

export const RefreshControl = forwardRef<
  RefreshControlRef,
  RefreshControlProps
>(function RefreshControl(props, ref): React.JSX.Element | null {
  const { children } = props as InjectedRefreshControlProps;
  const {
    refreshing,
    onRefresh,
    renderHeader,
    enabled = true,
    threshold: thresholdProp,
    limit: limitProp,
    dragRate: dragRateProp,
    timeout: timeoutProp,
    style,
    onStateChange,
  } = props;
  const threshold = positiveOrDefault(
    'threshold',
    thresholdProp,
    DEFAULT_THRESHOLD,
  );
  const dragRate = Math.min(
    1,
    positiveOrDefault('dragRate', dragRateProp, DEFAULT_DRAG_RATE),
  );
  const configuredMaxDistance = positiveOrDefault(
    'limit',
    limitProp,
    threshold * 2,
  );
  const [headerHeight, setHeaderHeight] = useState(
    DEFAULT_REFRESH_HEADER_HEIGHT,
  );
  const limit = Math.max(
    threshold / dragRate,
    headerHeight,
    configuredMaxDistance,
  );
  const timeout = nonNegativeOrDefault('timeout', timeoutProp, DEFAULT_TIMEOUT);

  // 控制器在组件整个生命周期内保持同一实例，id 才能稳定关联原生 Fabric 视图。
  const [controller] = useState(() =>
    NitroModules.createHybridObject<RefreshController>('RefreshController'),
  );
  const [phase, setPhase] = useState<RefreshPhase>(RefreshPhase.IDLE);
  const [refreshRequestVersion, setRefreshRequestVersion] = useState(0);
  const phaseValue = useSharedValue<RefreshPhase>(RefreshPhase.IDLE);
  const offset = useSharedValue(0);
  const progress = useSharedValue(0);
  const onRefreshRef = useRef(onRefresh);
  const onStateChangeRef = useRef(onStateChange);

  onRefreshRef.current = onRefresh;
  onStateChangeRef.current = onStateChange;

  useEffect(() => {
    // 使用 ref 调用最新回调，避免每次父组件渲染都跨 JSI 重新注册函数。
    controller.setOnRefresh(() => {
      onRefreshRef.current();
      // 强制完成一次 React 提交，再由下方 effect 同步最终受控值。不能依赖单帧延迟，
      // 并发渲染可能在该帧后才提交 refreshing=true，造成原生先回弹又重新进入刷新。
      setRefreshRequestVersion((version) => version + 1);
    });
    controller.setOnStateChange((nextPhase) => {
      setPhase(nextPhase);
      onStateChangeRef.current?.(nextPhase);
    });

    return () => controller.clearCallbacks();
  }, [controller]);

  useEffect(() => {
    // 禁用优先级高于 refreshing，确保运行中切换 enabled=false 也会可靠复位。
    controller.setRefreshing(enabled && refreshing);
  }, [controller, enabled, refreshing, refreshRequestVersion]);

  useImperativeHandle(
    ref,
    () => ({
      beginRefresh: () => controller.beginRefresh(),
      cancelRefresh: () => controller.cancelRefresh(),
      finishRefresh: (result) => controller.finishRefresh(result, timeout),
      getState: () => controller.getState(),
      pullToMax: () => controller.pullToMax(),
    }),
    [controller, timeout],
  );

  const handleHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const measuredHeight = event.nativeEvent.layout.height;
    if (!Number.isFinite(measuredHeight) || measuredHeight <= 0) {
      return;
    }
    setHeaderHeight((currentHeight) =>
      Math.abs(currentHeight - measuredHeight) < HEADER_HEIGHT_EPSILON
        ? currentHeight
        : measuredHeight,
    );
  }, []);

  // Fabric 直接事件在 UI runtime 中更新 SharedValue，不经过 React state。
  const pullEventHandler = useEvent<RefreshPullEvent>(
    (event) => {
      'worklet';
      // 拖拽和松手动画都由原生逐帧发送真实可见位移。这里直接赋值，确保自定义头、
      // iOS contentOffset 和 Android translationY 始终使用同一条运动轨迹。
      offset.value = event.offset;
      progress.value = Math.max(0, Math.min(1, event.progress));
      phaseValue.value = event.phase as RefreshPhase;
    },
    ['onPull'],
  );

  const headerStyle = useAnimatedStyle(() => ({
    // 未完全露出时紧贴内容进入视口；达到保持高度后固定在顶部，避免超额下拉时头部上方留白。
    transform: [
      {
        translateY: Math.min(offset.value, headerHeight) - headerHeight,
      },
    ],
  }));

  const headerContext = useMemo<RefreshHeaderContext>(
    () => ({
      offset,
      phase,
      phaseValue,
      progress,
      threshold,
    }),
    [offset, phase, phaseValue, progress, threshold],
  );

  const nativeControl = (
    <AnimatedNativeRefreshControl
      controllerId={controller.id}
      dragRate={dragRate}
      enabled={enabled}
      headerHeight={headerHeight}
      limit={limit}
      onPull={pullEventHandler as unknown as NativeProps['onPull']}
      threshold={threshold}
    />
  );
  const header =
    renderHeader === undefined ? (
      <DefaultRefreshHeader {...headerContext} />
    ) : (
      renderHeader(headerContext)
    );

  if (Platform.OS === 'ios') {
    if (__DEV__ && children != null) {
      console.error(
        '[react-native-nitro-refresh] RefreshControl 只能通过滚动组件的 refreshControl 属性使用，不能包裹子元素。',
      );
    }

    return cloneElement(
      nativeControl,
      {
        style: [style, styles.iosControl],
      },
      <View
        onLayout={handleHeaderLayout}
        pointerEvents="none"
        style={[styles.iosHeader, { top: -headerHeight }]}
      >
        {header}
      </View>,
    );
  }

  if (children == null) {
    if (__DEV__) {
      console.error(
        '[react-native-nitro-refresh] RefreshControl 必须通过滚动组件的 refreshControl 属性使用。',
      );
    }
    return null;
  }

  if (__DEV__ && (children.props.horizontal || children.props.inverted)) {
    console.warn(
      '[react-native-nitro-refresh] 首版仅支持纵向、非倒置滚动组件。',
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Animated.View
        onLayout={handleHeaderLayout}
        pointerEvents="none"
        style={[styles.header, headerStyle]}
      >
        {header}
      </Animated.View>
      {cloneElement(nativeControl, { style: styles.nativeControl }, children)}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  header: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10,
  },
  iosControl: {
    height: 0,
    left: 0,
    overflow: 'visible',
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10,
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
