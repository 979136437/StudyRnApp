import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  captureException,
  isSentryEnabled,
  triggerNativeCrash,
} from './sentry';
import { markReportViewed, readReport } from './service';
import {
  clearReports,
  deleteReport,
  exportReport,
  listReportSummaries,
} from './storage';
import type { DiagnosticReport, DiagnosticReportSummary } from './types';

const KIND_LABELS: Record<DiagnosticReport['kind'], string> = {
  javascript: 'JavaScript',
  react: 'React 渲染',
  native: '原生崩溃',
  'abnormal-termination': '异常退出',
  manual: '手动记录',
};

export interface DiagnosticsScreenProps {
  onBack: () => void;
}

export function DiagnosticsScreen({
  onBack,
}: DiagnosticsScreenProps): React.JSX.Element {
  const [reports, setReports] = useState<DiagnosticReportSummary[]>([]);
  const [selected, setSelected] = useState<DiagnosticReport | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(() => setReports(listReportSummaries()), []);
  useEffect(refresh, [refresh]);

  const openReport = useCallback(
    (id: string) => {
      const report = markReportViewed(id) ?? readReport(id);
      setSelected(report);
      setActionError(null);
      refresh();
    },
    [refresh],
  );

  const shareReport = useCallback(async (id: string) => {
    try {
      await exportReport(id);
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '导出失败');
    }
  }, []);

  const removeReport = useCallback(
    (id: string) => {
      Alert.alert('删除报告', '此操作无法恢复。', [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => {
            deleteReport(id);
            setSelected((current) => (current?.id === id ? null : current));
            refresh();
          },
        },
      ]);
    },
    [refresh],
  );

  const removeAll = useCallback(() => {
    Alert.alert('清空全部报告', '此操作无法恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '清空',
        style: 'destructive',
        onPress: () => {
          clearReports();
          setSelected(null);
          refresh();
        },
      },
    ]);
  }, [refresh]);

  const testJavaScriptCrash = useCallback(() => {
    Alert.alert('触发 JavaScript 崩溃', '应用将立即进入异常流程。', [
      { text: '取消', style: 'cancel' },
      {
        text: '触发',
        style: 'destructive',
        onPress: () => {
          setTimeout(() => {
            throw new Error('诊断中心 JavaScript 崩溃测试');
          }, 0);
        },
      },
    ]);
  }, []);

  const testNativeCrash = useCallback(() => {
    Alert.alert('触发原生崩溃', '应用进程将立即退出。', [
      { text: '取消', style: 'cancel' },
      { text: '触发', style: 'destructive', onPress: triggerNativeCrash },
    ]);
  }, []);

  const testHandledError = useCallback(() => {
    captureException(new Error('诊断中心手动异常测试'), {
      kind: 'manual',
      extra: { source: 'diagnostics-screen' },
    });
    setTimeout(refresh, 100);
  }, [refresh]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="返回首页"
          accessibilityRole="button"
          hitSlop={10}
          onPress={onBack}
          style={styles.backButton}
        >
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>DIAGNOSTICS</Text>
          <Text style={styles.title}>诊断中心</Text>
        </View>
        <View
          style={[
            styles.status,
            isSentryEnabled() ? styles.online : styles.local,
          ]}
        >
          <Text style={styles.statusText}>
            {isSentryEnabled() ? 'Sentry 已启用' : '仅本地'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {actionError === null ? null : (
          <Text style={styles.actionError}>{actionError}</Text>
        )}

        {__DEV__ ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>开发测试</Text>
            <View style={styles.actionRow}>
              <Pressable onPress={testHandledError} style={styles.actionButton}>
                <Text style={styles.actionButtonText}>记录异常</Text>
              </Pressable>
              <Pressable
                onPress={testJavaScriptCrash}
                style={styles.actionButton}
              >
                <Text style={styles.actionButtonText}>JS 崩溃</Text>
              </Pressable>
              <Pressable onPress={testNativeCrash} style={styles.dangerButton}>
                <Text style={styles.dangerButtonText}>原生崩溃</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>最近报告</Text>
            {reports.length === 0 ? null : (
              <Pressable onPress={removeAll}>
                <Text style={styles.clearText}>清空</Text>
              </Pressable>
            )}
          </View>
          {reports.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>暂无诊断报告</Text>
            </View>
          ) : (
            <View style={styles.reportList}>
              {reports.map((report) => (
                <Pressable
                  key={report.id}
                  onPress={() => openReport(report.id)}
                  style={styles.reportRow}
                >
                  <View style={styles.reportMain}>
                    <Text style={styles.reportKind}>
                      {KIND_LABELS[report.kind]}
                    </Text>
                    <Text numberOfLines={1} style={styles.reportMessage}>
                      {report.errorName}: {report.errorMessage}
                    </Text>
                    <Text style={styles.reportMeta}>
                      {new Date(report.createdAt).toLocaleString()} ·{' '}
                      {report.platform}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {selected === null ? null : (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>报告详情</Text>
              <View style={styles.detailActions}>
                <Pressable onPress={() => void shareReport(selected.id)}>
                  <Text style={styles.shareText}>导出</Text>
                </Pressable>
                <Pressable onPress={() => removeReport(selected.id)}>
                  <Text style={styles.clearText}>删除</Text>
                </Pressable>
              </View>
            </View>
            <Text selectable style={styles.jsonText}>
              {JSON.stringify(selected, null, 2)}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  backIcon: { color: '#18221e', fontSize: 34, lineHeight: 36 },
  actionButton: {
    borderColor: '#aab6b0',
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 13,
  },
  actionButtonText: { color: '#26342e', fontSize: 13, fontWeight: '800' },
  actionError: { color: '#b42318', fontSize: 13, marginBottom: 14 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chevron: { color: '#7a8881', fontSize: 25, width: 20 },
  clearText: { color: '#b42318', fontSize: 13, fontWeight: '800' },
  content: { paddingBottom: 40, paddingHorizontal: 20 },
  dangerButton: {
    backgroundColor: '#b42318',
    borderRadius: 6,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 13,
  },
  dangerButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  detailActions: { flexDirection: 'row', gap: 18 },
  empty: {
    borderColor: '#d8dfda',
    borderRadius: 6,
    borderWidth: 1,
    padding: 20,
  },
  emptyText: { color: '#66766e', fontSize: 14, textAlign: 'center' },
  eyebrow: { color: '#147d64', fontSize: 10, fontWeight: '900' },
  header: {
    alignItems: 'center',
    borderBottomColor: '#d8dfda',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
  },
  heading: { flex: 1 },
  jsonText: {
    backgroundColor: '#18221e',
    borderRadius: 6,
    color: '#dce7e1',
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 17,
    padding: 14,
  },
  local: { backgroundColor: '#e6e9e7' },
  online: { backgroundColor: '#d7efe7' },
  pressed: { backgroundColor: '#e8eeea' },
  reportKind: { color: '#147d64', fontSize: 11, fontWeight: '900' },
  reportList: {
    borderColor: '#d8dfda',
    borderRadius: 6,
    borderWidth: 1,
    overflow: 'hidden',
  },
  reportMain: { flex: 1, gap: 3 },
  reportMessage: { color: '#18221e', fontSize: 14, fontWeight: '700' },
  reportMeta: { color: '#7a8881', fontSize: 11 },
  reportRow: {
    alignItems: 'center',
    borderBottomColor: '#e3e8e4',
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 76,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  safeArea: { backgroundColor: '#f2f5f2', flex: 1 },
  section: { marginTop: 24 },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    color: '#66766e',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 8,
  },
  shareText: { color: '#147d64', fontSize: 13, fontWeight: '800' },
  status: { borderRadius: 4, paddingHorizontal: 9, paddingVertical: 6 },
  statusText: { color: '#26342e', fontSize: 11, fontWeight: '800' },
  title: { color: '#18221e', fontSize: 26, fontWeight: '900', marginTop: 4 },
});
