import { Stack } from 'expo-router/stack';
import { MoreContentTestScreen } from 'react-native-nitro-recycler-list/testing';

export default function MoreContentRoute(): React.JSX.Element {
  return (
    <>
      <Stack.Screen options={{ title: '更多内容' }} />
      <MoreContentTestScreen />
    </>
  );
}
