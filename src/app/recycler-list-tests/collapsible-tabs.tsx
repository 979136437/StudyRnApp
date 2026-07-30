import { Stack } from 'expo-router/stack';
import { CollapsibleTabsTestScreen } from 'react-native-nitro-recycler-list/testing';

export default function CollapsibleTabsRoute(): React.JSX.Element {
  return (
    <>
      <Stack.Screen options={{ title: '折叠多页' }} />
      <CollapsibleTabsTestScreen />
    </>
  );
}
