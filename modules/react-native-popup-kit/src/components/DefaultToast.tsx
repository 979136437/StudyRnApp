import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  ToastType,
  type ToastType as ToastTypeValue,
} from '../toast/constants';

interface DefaultToastProps {
  icon?: React.ReactNode;
  message: React.ReactNode;
  type: ToastTypeValue;
}

function DefaultIcon({
  type,
}: {
  type: ToastTypeValue;
}): React.JSX.Element | null {
  if (type === ToastType.LOADING) return <ActivityIndicator color="#FFFFFF" />;
  if (type === ToastType.SUCCESS) return <Text style={styles.icon}>OK</Text>;
  if (type === ToastType.ERROR) return <Text style={styles.icon}>!</Text>;
  return null;
}

export function DefaultToast({
  icon,
  message,
  type,
}: DefaultToastProps): React.JSX.Element {
  const resolvedIcon = icon ?? <DefaultIcon type={type} />;
  return (
    <View accessibilityLiveRegion="polite" style={styles.root}>
      {type === ToastType.NONE && icon === undefined ? null : resolvedIcon}
      {typeof message === 'string' || typeof message === 'number' ? (
        <Text style={styles.message}>{message}</Text>
      ) : (
        message
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  message: { color: '#FFFFFF', fontSize: 14, lineHeight: 20 },
  root: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 33, 43, 0.92)',
    borderRadius: 6,
    flexDirection: 'row',
    gap: 10,
    maxWidth: '85%',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
