import { Stack } from 'expo-router/stack';
import { SecondLevelTestScreen } from 'react-native-nitro-recycler-list/testing';

export default function SecondLevelRoute(): React.JSX.Element {
  return (
    <>
      <Stack.Screen options={{ title: '下拉二级' }} />
      <SecondLevelTestScreen />
    </>
  );
}
