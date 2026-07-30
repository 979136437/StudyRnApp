import { Stack } from 'expo-router/stack';

import { FeaturedContentTestScreen } from '@/components/recycler-list-tests/recycler-list-test-screens';

export default function FeaturedContentRoute(): React.JSX.Element {
  return (
    <>
      <Stack.Screen options={{ title: '精选内容' }} />
      <FeaturedContentTestScreen />
    </>
  );
}
