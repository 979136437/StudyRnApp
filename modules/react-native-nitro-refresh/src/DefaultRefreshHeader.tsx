import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { RefreshPhase, type RefreshHeaderContext } from './types';

const PHASE_LABELS = {
  [RefreshPhase.IDLE]: '下拉刷新',
  [RefreshPhase.PULLING]: '继续下拉',
  [RefreshPhase.READY]: '松开刷新',
  [RefreshPhase.REFRESHING]: '正在刷新',
  [RefreshPhase.SETTLING]: '刷新完成',
} as const;

/**
 * 未传入 renderHeader 时使用的轻量默认刷新头。
 * 阶段文字由低频 React state 驱动，指示器旋转和透明度直接读取 SharedValue，
 * 因此连续拖拽不会触发本组件逐帧重新渲染。
 */
export function DefaultRefreshHeader({
  phase,
  progress,
}: RefreshHeaderContext): React.JSX.Element {
  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.25, 1], [0, 0.5, 1]),
    transform: [{ rotate: `${progress.value * 180}deg` }],
  }));

  return (
    <View style={styles.content}>
      {phase === RefreshPhase.REFRESHING ? (
        <ActivityIndicator color="#147d64" size="small" />
      ) : (
        <Animated.View style={[styles.indicator, indicatorStyle]} />
      )}
      <Text style={styles.label}>{PHASE_LABELS[phase]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  indicator: {
    borderBottomColor: '#147d64',
    borderLeftColor: '#147d64',
    borderRadius: 8,
    borderRightColor: '#147d64',
    borderTopColor: 'transparent',
    borderWidth: 2,
    height: 16,
    width: 16,
  },
  label: {
    color: '#36514a',
    fontSize: 13,
    fontWeight: '600',
  },
});
