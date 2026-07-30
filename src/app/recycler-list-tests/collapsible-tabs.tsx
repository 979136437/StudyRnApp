import { Stack } from 'expo-router/stack';

import { CollapsibleTabsTestScreen } from '@/components/recycler-list-tests/advanced-recycler-list-test-screens';

export default function CollapsibleTabsRoute(): React.JSX.Element {
  return (
    <>
      <Stack.Screen options={{ title: '折叠多页' }} />
      <CollapsibleTabsTestScreen />
    </>
  );
}
