import '@/global.css';
import { Stack } from 'expo-router/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { RequestProvider } from 'react-native-request-kit/react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { request } from '@/request';

export default function RootLayout(): React.JSX.Element {
  return (
    <GestureHandlerRootView className="flex-1">
      <RequestProvider request={request}>
        <KeyboardProvider>
          <SafeAreaProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </SafeAreaProvider>
        </KeyboardProvider>
      </RequestProvider>
    </GestureHandlerRootView>
  );
}
