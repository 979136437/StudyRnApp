import { useNavigation, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { DiagnosticsScreen } from 'react-native-diagnostics';

export default function DiagnosticsRoute(): React.JSX.Element {
  const navigation = useNavigation();
  const router = useRouter();

  const handleBack = useCallback(() => {
    // 路由行为由应用层持有，避免 workspace 组件访问未初始化的路由单例。
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    router.replace('/');
  }, [navigation, router]);

  return <DiagnosticsScreen onBack={handleBack} />;
}
