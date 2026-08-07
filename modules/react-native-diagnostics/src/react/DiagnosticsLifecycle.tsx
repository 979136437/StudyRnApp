import { type Href, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Alert, AppState } from 'react-native';

import { crashedLastRun } from '../api/sentry';
import {
  addLocalBreadcrumb,
  beginDiagnosticSession,
  endDiagnosticSession,
  markReportPrompted,
  setCurrentRoute,
  updateCurrentAppState,
} from '../api/diagnostics';

/** 在根路由内同步导航、应用状态和上次原生崩溃结果。 */
export function DiagnosticsLifecycle(): null {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setCurrentRoute(pathname);
    addLocalBreadcrumb('navigation', '路由变化', { pathname });
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    const subscription = AppState.addEventListener('change', (state) => {
      updateCurrentAppState(state);
      addLocalBreadcrumb('lifecycle', '应用状态变化', { state });
    });

    void crashedLastRun()
      .catch(() => false)
      .then((nativeCrashed) => {
        if (cancelled) return;
        const report = beginDiagnosticSession(nativeCrashed);
        if (report === null) return;
        markReportPrompted(report.id);
        Alert.alert('检测到异常退出', report.error.message, [
          { text: '稍后', style: 'cancel' },
          {
            text: '查看报告',
            onPress: () => router.push('/diagnostics' as Href),
          },
        ]);
      });

    return () => {
      cancelled = true;
      subscription.remove();
      endDiagnosticSession();
    };
  }, [router]);

  return null;
}
