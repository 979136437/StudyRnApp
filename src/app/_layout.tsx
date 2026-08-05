import '@/global.css';
import { Stack } from 'expo-router/stack';
import {
  DiagnosticsErrorBoundary,
  DiagnosticsLifecycle,
  initializeSentry,
  installGlobalErrorHandler,
  wrapWithSentry,
} from 'react-native-diagnostics';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { RequestProvider } from 'react-native-request-kit/react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HeroTransitionProvider } from '@/components/hero/hero-transition';
import { request } from '@/request';

initializeSentry();
installGlobalErrorHandler();

function RootLayout(): React.JSX.Element {
  return (
    <GestureHandlerRootView className="flex-1">
      <RequestProvider request={request}>
        <KeyboardProvider>
          <SafeAreaProvider>
            <DiagnosticsLifecycle />
            <DiagnosticsErrorBoundary>
              <HeroTransitionProvider>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen
                    name="feed/[id]"
                    options={{ animation: 'none' }}
                  />
                </Stack>
              </HeroTransitionProvider>
            </DiagnosticsErrorBoundary>
          </SafeAreaProvider>
        </KeyboardProvider>
      </RequestProvider>
    </GestureHandlerRootView>
  );
}

export default wrapWithSentry(RootLayout);
