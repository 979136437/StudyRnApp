import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { RefreshPhase, type RefreshHeaderContext } from './types';

const PHASE_LABELS = {
  [RefreshPhase.IDLE]: '下拉刷新',
  [RefreshPhase.PULLING]: '继续下拉',
  [RefreshPhase.READY]: '松开立即刷新',
  [RefreshPhase.REFRESHING]: '正在刷新...',
  [RefreshPhase.SUCCESS]: '刷新成功',
  [RefreshPhase.FAILURE]: '刷新失败',
  [RefreshPhase.SETTLING]: '刷新完成',
} as const;

function formatRefreshTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * 未传入 renderHeader 时使用的轻量默认刷新头。
 * 阶段文字由低频 React state 驱动，指示器旋转和透明度直接读取 SharedValue，
 * 因此连续拖拽不会触发本组件逐帧重新渲染。
 */
export function DefaultRefreshHeader({
  phase,
  progress,
}: RefreshHeaderContext): React.JSX.Element {
  const previousPhaseRef = useRef(phase);
  const [lastRefreshTime, setLastRefreshTime] = useState(() =>
    formatRefreshTime(new Date()),
  );
  const isResult =
    phase === RefreshPhase.SUCCESS || phase === RefreshPhase.FAILURE;
  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 180}deg` }],
  }));

  useEffect(() => {
    if (
      phase === RefreshPhase.REFRESHING &&
      previousPhaseRef.current !== RefreshPhase.REFRESHING
    ) {
      setLastRefreshTime(formatRefreshTime(new Date()));
    }
    previousPhaseRef.current = phase;
  }, [phase]);

  return (
    <View style={styles.content}>
      <View style={styles.iconSlot}>
        {phase === RefreshPhase.REFRESHING ? (
          <ActivityIndicator color="#333333" size="small" />
        ) : isResult ? (
          <View
            style={[
              styles.resultIndicator,
              phase === RefreshPhase.SUCCESS
                ? styles.resultSuccess
                : styles.resultFailure,
            ]}
          >
            <Text style={styles.resultGlyph}>
              {phase === RefreshPhase.SUCCESS ? '✓' : '!'}
            </Text>
          </View>
        ) : (
          <Animated.Text style={[styles.arrow, arrowStyle]}>↓</Animated.Text>
        )}
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{PHASE_LABELS[phase]}</Text>
        <Text style={styles.time}>最后更新：{lastRefreshTime}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  arrow: {
    color: '#333333',
    fontSize: 26,
    lineHeight: 30,
    textAlign: 'center',
  },
  copy: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 154,
  },
  iconSlot: {
    alignItems: 'center',
    height: 30,
    justifyContent: 'center',
    marginRight: 10,
    width: 30,
  },
  resultFailure: {
    backgroundColor: '#c84f45',
  },
  resultGlyph: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
  resultIndicator: {
    borderRadius: 10,
    height: 20,
    width: 20,
  },
  resultSuccess: {
    backgroundColor: '#147d64',
  },
  time: {
    color: '#777777',
    fontSize: 12,
    marginTop: 4,
  },
  title: {
    color: '#333333',
    fontSize: 14,
    fontWeight: '500',
  },
});
