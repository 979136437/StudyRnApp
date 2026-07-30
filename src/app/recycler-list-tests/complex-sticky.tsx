import { Stack } from 'expo-router/stack';

import { ComplexStickyTestScreen } from '@/components/recycler-list-tests/advanced-recycler-list-test-screens';

export default function ComplexStickyRoute(): React.JSX.Element {
  return (
    <>
      <Stack.Screen options={{ title: '复杂吸顶' }} />
      <ComplexStickyTestScreen />
    </>
  );
}
