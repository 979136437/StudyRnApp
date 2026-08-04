import LottieView, { type LottieViewProps } from 'lottie-react-native';
import { useEffect, useRef, type ReactElement } from 'react';
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import {
  RefreshHeader,
  RefreshLayout,
  RefreshState,
  type RefreshOffsetEvent,
} from 'react-native-nitro-refresh';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRefreshAnimation } from '../../../modules/react-native-nitro-refresh/src/refresh-context';
import {
  labelForRefreshState,
  shouldResetRefreshAnimation,
} from './refresh-view-model';

const ANIMATION_CONTENT_HEIGHT = 80;
const LOTTIE_SIZE = 54;
const LOTTIE_SPEED = 2;
const STATUS_FONT_SIZE = 12;
const STATUS_GAP = 2;
const DEFAULT_STATUS_COLOR = '#666666';

const DEFAULT_ANIMATION_SOURCE =
  require('./assets/gifloading.json') as LottieViewProps['source'];
const AnimatedLottieView = Animated.createAnimatedComponent(LottieView);

export interface RefreshAnimateHeaderProps {
  refreshing: boolean;
  onRefresh?: () => void;
  enable?: boolean;
  children?: ReactElement | null;
  source?: LottieViewProps['source'];
  /** 是否在 Refreshing 阶段循环播放动画，默认为 true。 */
  animated?: boolean;
  onChangeOffset?: (event: RefreshOffsetEvent) => void;
  containerStyle?: ViewStyle;
  lottieStyle?: ViewStyle;
  titleStyle?: TextStyle;
  lottieOptions?: Omit<
    LottieViewProps,
    'autoPlay' | 'progress' | 'source' | 'style'
  >;
}

type AnimateHeaderContentProps = Pick<
  RefreshAnimateHeaderProps,
  'animated' | 'lottieOptions' | 'lottieStyle' | 'source' | 'titleStyle'
>;

/**
 * 动画头的逐帧进度直接绑定 RefreshLayout 的 Reanimated SharedValue。进入刷新后移除
 * progress 属性并使用 Lottie 原生播放器循环；End/Idle 都会 reset，避免下一次下拉
 * 从旧帧开始。
 */
function AnimateHeaderContent({
  animated = true,
  lottieOptions,
  lottieStyle,
  source = DEFAULT_ANIMATION_SOURCE,
  titleStyle,
}: AnimateHeaderContentProps): React.JSX.Element {
  const { progress, state } = useRefreshAnimation();
  const lottieRef = useRef<LottieView>(null);
  const animatedProps = useAnimatedProps<LottieViewProps>(() => ({
    progress: progress.value,
  }));

  useEffect(() => {
    if (state === RefreshState.Refreshing && animated) {
      lottieRef.current?.play();
      return;
    }
    if (shouldResetRefreshAnimation(state) || !animated) {
      lottieRef.current?.reset();
    }
  }, [animated, state]);

  return (
    <View style={styles.animateContent}>
      <AnimatedLottieView
        {...lottieOptions}
        {...(state === RefreshState.Refreshing ? {} : { animatedProps })}
        autoPlay={false}
        loop={animated}
        ref={lottieRef}
        resizeMode="contain"
        source={source}
        speed={LOTTIE_SPEED}
        style={[styles.lottie, lottieStyle]}
      />
      <Text style={[styles.status, titleStyle]}>
        {labelForRefreshState(state)}
      </Text>
    </View>
  );
}

/** 可直接传给滚动组件 refreshControl 的安全区动画刷新头。 */
export function RefreshAnimateHeader({
  children,
  containerStyle,
  enable,
  onChangeOffset,
  onRefresh,
  refreshing,
  ...contentProps
}: RefreshAnimateHeaderProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const headerHeight = ANIMATION_CONTENT_HEIGHT + insets.top;

  return (
    <RefreshLayout
      enable={enable}
      header={
        <RefreshHeader
          style={[
            styles.animateHeader,
            { height: headerHeight, paddingTop: insets.top },
            containerStyle,
          ]}
        >
          <AnimateHeaderContent {...contentProps} />
        </RefreshHeader>
      }
      onChangeOffset={onChangeOffset}
      onRefreshing={onRefresh}
      refreshing={refreshing}
    >
      {children}
    </RefreshLayout>
  );
}

const styles = StyleSheet.create({
  animateContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  animateHeader: {
    alignItems: 'center',
    height: ANIMATION_CONTENT_HEIGHT,
    justifyContent: 'center',
  },
  lottie: {
    height: LOTTIE_SIZE,
    width: LOTTIE_SIZE,
  },
  status: {
    color: DEFAULT_STATUS_COLOR,
    fontSize: STATUS_FONT_SIZE,
    marginTop: STATUS_GAP,
  },
});
