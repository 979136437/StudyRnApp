import { Directory, File, Paths } from 'expo-file-system';
import { Stack } from 'expo-router/stack';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { getNitroRecyclerTraceLog } from 'react-native-nitro-recycler-list';
import { SafeAreaView } from 'react-native-safe-area-context';

function traceFileName(): string {
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  return `nitro-recycler-${timestamp}.log`;
}

function ExportTraceButton(): React.JSX.Element {
  const [exporting, setExporting] = useState(false);

  const exportTrace = useCallback(async () => {
    if (exporting) return;
    const contents = getNitroRecyclerTraceLog();
    if (contents.length === 0) {
      Alert.alert('暂无日志', '当前还没有 NitroRecyclerTrace 运行轨迹。');
      return;
    }
    setExporting(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('当前设备不支持系统分享');
      }
      const directory = new Directory(Paths.cache, 'nitro-recycler-logs');
      directory.create({ idempotent: true, intermediates: true });
      const file = new File(directory, traceFileName());
      file.create({ intermediates: true, overwrite: true });
      file.write(`${contents}\n`);
      await Sharing.shareAsync(file.uri, {
        dialogTitle: '导出 NitroRecyclerTrace 日志',
        mimeType: 'text/plain',
        UTI: 'public.plain-text',
      });
    } catch (error) {
      Alert.alert(
        '导出失败',
        error instanceof Error ? error.message : '无法导出日志文件',
      );
    } finally {
      setExporting(false);
    }
  }, [exporting]);

  return (
    <Pressable
      accessibilityLabel="导出 NitroRecyclerTrace 日志"
      accessibilityRole="button"
      disabled={exporting}
      hitSlop={8}
      onPress={() => void exportTrace()}
      style={({ pressed }) => [
        styles.exportButton,
        pressed && styles.exportButtonPressed,
      ]}
    >
      <Text style={styles.exportButtonText}>
        {exporting ? '导出中' : '导出日志'}
      </Text>
    </Pressable>
  );
}

export default function RecyclerListTestsLayout(): React.JSX.Element {
  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <Stack
        screenOptions={{
          headerBackButtonDisplayMode: 'minimal',
          headerRight: () => <ExportTraceButton />,
          headerShadowVisible: false,
          headerTitleStyle: { color: '#18221e', fontWeight: '700' },
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  exportButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 8,
  },
  exportButtonPressed: { opacity: 0.55 },
  exportButtonText: { color: '#147d64', fontSize: 13, fontWeight: '700' },
  safeArea: { flex: 1 },
});
