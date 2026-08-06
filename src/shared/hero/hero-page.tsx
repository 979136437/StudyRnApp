import { Stack } from 'expo-router/stack';
import { useCallback, useEffect, type ReactNode } from 'react';
import { BackHandler } from 'react-native';

import { useHeroBack } from './hero-transition';

export interface HeroPageControls {
  goBack: () => void;
}

interface HeroPageProps {
  children: (controls: HeroPageControls) => ReactNode;
  heroId: string;
}

export function HeroPage({
  children,
  heroId,
}: HeroPageProps): React.JSX.Element {
  const { gestureEnabled, goBack, release } = useHeroBack(heroId);
  const handleHardwareBack = useCallback(() => {
    goBack();
    return true;
  }, [goBack]);

  useEffect(() => {
    if (process.env.EXPO_OS === 'web') {
      return;
    }
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      handleHardwareBack,
    );
    return () => subscription.remove();
  }, [handleHardwareBack]);

  useEffect(() => {
    // 手势直接弹出路由时没有机会执行反向动画，需要在卸载阶段释放来源卡片。
    return release;
  }, [release]);

  return (
    <>
      <Stack.Screen options={{ gestureEnabled }} />
      {children({ goBack })}
    </>
  );
}
