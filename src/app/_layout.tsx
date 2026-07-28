import '@/global.css';

import { Stack } from 'expo-router/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import MyVariableContextProvider from '@/components/MyVariableContextProvider';

export default function RootLayout(): React.JSX.Element {
  return (
    <GestureHandlerRootView>
      <KeyboardProvider>
        <SafeAreaProvider>
          <MyVariableContextProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </MyVariableContextProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
