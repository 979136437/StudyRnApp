import { Stack } from 'expo-router/stack';
import { FeaturedContentTestScreen } from 'react-native-nitro-recycler-list/testing';

export default function FeaturedContentRoute(): React.JSX.Element {
  return (
    <>
      <Stack.Screen options={{ title: '精选内容' }} />
      <FeaturedContentTestScreen />
    </>
  );
}
