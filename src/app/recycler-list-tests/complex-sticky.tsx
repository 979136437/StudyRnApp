import { Stack } from 'expo-router/stack';
import { ComplexStickyTestScreen } from 'react-native-nitro-recycler-list/testing';

export default function ComplexStickyRoute(): React.JSX.Element {
  return (
    <>
      <Stack.Screen options={{ title: '复杂吸顶' }} />
      <ComplexStickyTestScreen />
    </>
  );
}
