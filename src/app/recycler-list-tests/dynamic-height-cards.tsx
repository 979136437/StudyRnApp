import { Stack } from 'expo-router/stack';
import { DynamicHeightCardsTestScreen } from 'react-native-nitro-recycler-list/testing';

export default function DynamicHeightCardsRoute(): React.JSX.Element {
  return (
    <>
      <Stack.Screen options={{ title: '动态高度卡片' }} />
      <DynamicHeightCardsTestScreen />
    </>
  );
}
