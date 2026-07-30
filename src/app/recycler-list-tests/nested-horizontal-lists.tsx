import { Stack } from 'expo-router/stack';

import { NestedHorizontalListsTestScreen } from '@/components/recycler-list-tests/recycler-list-test-screens';

export default function NestedHorizontalListsRoute(): React.JSX.Element {
  return (
    <>
      <Stack.Screen options={{ title: '横向嵌套列表' }} />
      <NestedHorizontalListsTestScreen />
    </>
  );
}
