import { Stack } from 'expo-router/stack';

import { MoreContentTestScreen } from '@/components/recycler-list-tests/recycler-list-test-screens';

export default function MoreContentRoute(): React.JSX.Element {
  return (
    <>
      <Stack.Screen options={{ title: '更多内容' }} />
      <MoreContentTestScreen />
    </>
  );
}
