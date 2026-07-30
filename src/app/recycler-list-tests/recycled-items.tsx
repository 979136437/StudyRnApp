import { Stack } from 'expo-router/stack';
import { RecycledItemsTestScreen } from 'react-native-nitro-recycler-list/testing';

export default function RecycledItemsRoute(): React.JSX.Element {
  return (
    <>
      <Stack.Screen options={{ title: '回收项' }} />
      <RecycledItemsTestScreen />
    </>
  );
}
