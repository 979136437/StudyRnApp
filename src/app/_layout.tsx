import '@/global.css';
import { Stack } from 'expo-router/stack';
import type { PropsWithChildren } from 'react';
import {
  DiagnosticsErrorBoundary,
  DiagnosticsLifecycle,
  initializeSentry,
  installGlobalErrorHandler,
  wrapWithSentry,
} from 'react-native-diagnostics';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { PopupProvider } from 'react-native-popup-kit';
import { RequestProvider } from 'react-native-request-kit/react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HeroTransitionProvider } from '@/components/hero/hero-transition';
import { request } from '@/request';

initializeSentry();
installGlobalErrorHandler();

const ROOT_STACK_OPTIONS = { headerShown: false } as const;
const FEED_SCREEN_OPTIONS = { animation: 'none' } as const;

function RootProviders({ children }: PropsWithChildren): React.JSX.Element {
  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <DiagnosticsErrorBoundary>
          <RequestProvider request={request}>
            <KeyboardProvider>
              <PopupProvider scope="global">{children}</PopupProvider>
            </KeyboardProvider>
          </RequestProvider>
        </DiagnosticsErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppNavigator(): React.JSX.Element {
  return (
    <Stack screenOptions={ROOT_STACK_OPTIONS}>
      <Stack.Screen name="feed/[id]" options={FEED_SCREEN_OPTIONS} />
    </Stack>
  );
}

function RootLayout(): React.JSX.Element {
  return (
    <RootProviders>
      <DiagnosticsLifecycle />
      <HeroTransitionProvider>
        <AppNavigator />
      </HeroTransitionProvider>
    </RootProviders>
  );
}

export default wrapWithSentry(RootLayout);
