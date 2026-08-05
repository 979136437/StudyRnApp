import { useEffect } from 'react';
import { AccessibilityInfo, ActivityIndicator, Text, View } from 'react-native';

import type { LoadingComponentProps } from '../types';
import { DEFAULT_POPUP_APPEARANCE } from './defaults';
import { styles } from './styles';

export function DefaultLoading({
  options,
}: LoadingComponentProps): React.JSX.Element {
  useEffect(() => {
    void AccessibilityInfo.announceForAccessibility(options.title);
  }, [options.title]);

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      style={styles.toast}
    >
      <ActivityIndicator
        color={DEFAULT_POPUP_APPEARANCE.toastTextColor}
        size="large"
      />
      <Text numberOfLines={1} style={styles.toastText}>
        {options.title}
      </Text>
    </View>
  );
}
