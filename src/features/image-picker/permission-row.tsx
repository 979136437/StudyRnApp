import { StyleSheet, Text, View } from 'react-native';
import type { MediaPermissionResponse } from 'react-native-nitro-image-picker';

import { ActionButton } from './action-button';
import { imagePickerColors } from './colors';

interface PermissionRowProps {
  busy: boolean;
  permission?: MediaPermissionResponse;
  requestLabel: string;
  title: string;
  onRequest: () => void;
}

function permissionLabel(permission?: MediaPermissionResponse): string {
  if (!permission) return '读取中';
  if (permission.accessPrivileges === 'limited') return '已授权 · 有限访问';
  if (permission.granted) return '已授权 · 完整访问';
  if (permission.status === 'undetermined') return '尚未询问';
  return permission.canAskAgain
    ? '已拒绝 · 可再次询问'
    : '已拒绝 · 请前往系统设置';
}

export function PermissionRow({
  busy,
  onRequest,
  permission,
  requestLabel,
  title,
}: PermissionRowProps): React.JSX.Element {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text selectable style={styles.title}>
          {title}
        </Text>
        <Text selectable style={styles.status}>
          {permissionLabel(permission)}
        </Text>
      </View>
      <View style={styles.action}>
        <ActionButton busy={busy} label={requestLabel} onPress={onRequest} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  action: { width: 116 },
  copy: { flex: 1, gap: 4 },
  row: {
    alignItems: 'center',
    borderBottomColor: imagePickerColors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 16,
    minHeight: 66,
    paddingVertical: 10,
  },
  status: { color: imagePickerColors.muted, fontSize: 13 },
  title: { color: imagePickerColors.text, fontSize: 15, fontWeight: '600' },
});
