import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { imagePickerColors } from './colors';

interface ActionButtonProps {
  busy?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'secondary' | 'danger';
}

export function ActionButton({
  busy = false,
  disabled = false,
  label,
  onPress,
  tone = 'secondary',
}: ActionButtonProps): React.JSX.Element {
  const primary = tone === 'primary';
  const danger = tone === 'danger';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={[
        styles.button,
        primary && styles.primaryButton,
        danger && styles.dangerButton,
        (disabled || busy) && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator
          color={primary ? '#ffffff' : imagePickerColors.accent}
          size="small"
        />
      ) : (
        <Text
          style={[
            styles.label,
            primary && styles.primaryLabel,
            danger && styles.dangerLabel,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderColor: imagePickerColors.border,
    borderCurve: 'continuous',
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    flexGrow: 1,
    height: 42,
    justifyContent: 'center',
    minWidth: 116,
    paddingHorizontal: 14,
  },
  dangerButton: { borderColor: imagePickerColors.danger },
  dangerLabel: { color: imagePickerColors.danger },
  disabled: { opacity: 0.45 },
  label: { color: imagePickerColors.accent, fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.65 },
  primaryButton: {
    backgroundColor: imagePickerColors.accent,
    borderColor: imagePickerColors.accent,
  },
  primaryLabel: { color: '#ffffff' },
});
