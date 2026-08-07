import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { captureException } from '../api/sentry';
import { exportLatestReport } from '../native/report-storage';

type Props = { children: ReactNode };
type State = { error: Error | null; exportError: string | null };

/** 捕获 React 渲染异常，并提供不依赖路由树的导出兜底界面。 */
export class DiagnosticsErrorBoundary extends Component<Props, State> {
  state: State = { error: null, exportError: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, exportError: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureException(error, {
      kind: 'react',
      fatal: true,
      extra: { componentStack: info.componentStack },
    });
  }

  private readonly retry = (): void => {
    this.setState({ error: null, exportError: null });
  };

  private readonly exportReport = async (): Promise<void> => {
    try {
      await exportLatestReport();
      this.setState({ exportError: null });
    } catch (error) {
      this.setState({
        exportError: error instanceof Error ? error.message : '导出失败',
      });
    }
  };

  render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.eyebrow}>应用异常</Text>
          <Text style={styles.title}>{this.state.error.name}</Text>
          <Text selectable style={styles.message}>
            {this.state.error.message}
          </Text>
          {this.state.exportError === null ? null : (
            <Text style={styles.error}>{this.state.exportError}</Text>
          )}
          <View style={styles.actions}>
            <Pressable
              onPress={this.exportReport}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>导出报告</Text>
            </Pressable>
            <Pressable onPress={this.retry} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>重新渲染</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  content: { paddingHorizontal: 22, paddingTop: 48 },
  error: { color: '#b42318', fontSize: 13, marginTop: 16 },
  eyebrow: { color: '#b42318', fontSize: 12, fontWeight: '800' },
  message: { color: '#52605a', fontSize: 14, lineHeight: 21, marginTop: 12 },
  primaryButton: {
    backgroundColor: '#147d64',
    borderRadius: 6,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  safeArea: { backgroundColor: '#f2f5f2', flex: 1 },
  secondaryButton: {
    borderColor: '#aab6b0',
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonText: { color: '#26342e', fontSize: 14, fontWeight: '800' },
  title: { color: '#18221e', fontSize: 26, fontWeight: '900', marginTop: 6 },
});
