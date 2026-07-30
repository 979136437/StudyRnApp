import { Stack } from 'expo-router/stack';
import { ShortContentTestScreen } from 'react-native-nitro-recycler-list/testing';

export default function ShortContentRoute(): React.JSX.Element {
  return (
    <>
      <Stack.Screen options={{ title: '较短内容' }} />
      <ShortContentTestScreen />
    </>
  );
}
