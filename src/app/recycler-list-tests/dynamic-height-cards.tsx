import { Stack } from 'expo-router/stack';

import { DynamicHeightCardsTestScreen } from '@/components/recycler-list-tests/recycler-list-test-screens';

export default function DynamicHeightCardsRoute(): React.JSX.Element {
  return (
    <>
      <Stack.Screen options={{ title: '动态高度卡片' }} />
      <DynamicHeightCardsTestScreen />
    </>
  );
}
