import { Pressable, Text } from 'react-native';

import { popupDemoStyles as styles } from './styles';

interface DemoButtonProps {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  primary?: boolean;
}

export function DemoButton({
  disabled = false,
  label,
  onPress,
  primary = false,
}: DemoButtonProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        primary && styles.buttonPrimary,
        styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[styles.buttonText, primary && styles.buttonTextPrimary]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
