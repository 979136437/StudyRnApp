import { Stack } from 'expo-router/stack';

import { RecycledItemsTestScreen } from '@/components/recycler-list-tests/recycler-list-test-screens';

export default function RecycledItemsRoute(): React.JSX.Element {
  return (
    <>
      <Stack.Screen options={{ title: '回收项' }} />
      <RecycledItemsTestScreen />
    </>
  );
}
