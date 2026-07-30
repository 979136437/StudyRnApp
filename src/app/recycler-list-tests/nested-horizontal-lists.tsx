import { Stack } from 'expo-router/stack';
import { NestedHorizontalListsTestScreen } from 'react-native-nitro-recycler-list/testing';

export default function NestedHorizontalListsRoute(): React.JSX.Element {
  return (
    <>
      <Stack.Screen options={{ title: '横向嵌套列表' }} />
      <NestedHorizontalListsTestScreen />
    </>
  );
}
