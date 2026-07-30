import { Stack } from 'expo-router/stack';

import { SecondLevelTestScreen } from '@/components/recycler-list-tests/advanced-recycler-list-test-screens';

export default function SecondLevelRoute(): React.JSX.Element {
  return (
    <>
      <Stack.Screen options={{ title: '下拉二级' }} />
      <SecondLevelTestScreen />
    </>
  );
}
