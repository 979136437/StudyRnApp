import '@/global.css';
import { Stack } from 'expo-router';
import { type PropsWithChildren } from 'react';
import { MediaCacheProvider } from 'react-native-components';
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

import { mediaCacheStrategy } from '@/core/media-cache';
import { request } from '@/core/request';
import { HeroTransitionProvider } from '@/shared/hero';

initializeSentry();
installGlobalErrorHandler();

function RootProviders({ children }: PropsWithChildren) {
  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <DiagnosticsErrorBoundary>
          <MediaCacheProvider strategy={mediaCacheStrategy} defaultEnabled>
            <RequestProvider request={request}>
              <KeyboardProvider>
                <PopupProvider>{children}</PopupProvider>
              </KeyboardProvider>
            </RequestProvider>
          </MediaCacheProvider>
        </DiagnosticsErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppNavigator(): React.JSX.Element {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen
        name="index"
        options={{
          headerShown: true,
          title: '首页',
        }}
      />
      <Stack.Screen
        name="cache"
        options={{
          headerShown: true,
          title: '缓存统计',
        }}
      />
      <Stack.Screen name="feed/[id]" options={{ animation: 'none' }} />
      <Stack.Screen
        name="popup-demo"
        options={{
          headerShown: true,
          title: '弹窗示例',
        }}
      />
      <Stack.Screen
        name="popup-components"
        options={{ headerShown: true, title: 'Toast 与 Modal 测试' }}
      />
      <Stack.Screen
        name="visibility-observer"
        options={{
          headerShown: true,
          title: '可见性监听测试',
        }}
      />
      <Stack.Screen
        name="interactive-list"
        options={{
          headerShown: true,
          title: '交互列表测试',
        }}
      />
      <Stack.Screen
        name="media-test"
        options={{
          headerShown: true,
          title: '媒体能力测试',
        }}
      />
    </Stack>
  );
}

function RootLayout() {
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
