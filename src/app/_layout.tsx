import '@/global.css';
import { Stack } from 'expo-router/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { RequestStrategyProvider } from 'react-native-request-strategy';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { requestStrategy } from '@/request';

export default function RootLayout(): React.JSX.Element {
  return (
    <GestureHandlerRootView className="flex-1">
      <RequestStrategyProvider runtime={requestStrategy}>
        <KeyboardProvider>
          <SafeAreaProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </SafeAreaProvider>
        </KeyboardProvider>
      </RequestStrategyProvider>
    </GestureHandlerRootView>
  );
}
