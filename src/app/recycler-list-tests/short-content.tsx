import { Stack } from 'expo-router/stack';

import { ShortContentTestScreen } from '@/components/recycler-list-tests/recycler-list-test-screens';

export default function ShortContentRoute(): React.JSX.Element {
  return (
    <>
      <Stack.Screen options={{ title: '较短内容' }} />
      <ShortContentTestScreen />
    </>
  );
}
