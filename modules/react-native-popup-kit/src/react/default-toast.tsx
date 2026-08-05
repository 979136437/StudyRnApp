import { useEffect } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Image,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';

import type { ToastComponentProps } from '../types';
import { DEFAULT_POPUP_APPEARANCE } from './defaults';
import { styles } from './styles';

function imageSource(image: string | ImageSourcePropType): ImageSourcePropType {
  return typeof image === 'string' ? { uri: image } : image;
}

export function DefaultToast({
  options,
}: ToastComponentProps): React.JSX.Element {
  const icon = options.icon ?? 'success';
  const hasIcon = icon !== 'none' || options.image !== undefined;

  useEffect(() => {
    void AccessibilityInfo.announceForAccessibility(options.title);
  }, [options.title]);

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[styles.toast, !hasIcon && styles.toastWithoutIcon]}
    >
      {options.image !== undefined ? (
        <Image
          resizeMode="contain"
          source={imageSource(options.image)}
          style={styles.toastImage}
        />
      ) : icon === 'loading' ? (
        <ActivityIndicator
          color={DEFAULT_POPUP_APPEARANCE.toastTextColor}
          size="large"
        />
      ) : icon === 'none' ? null : (
        <Text accessibilityElementsHidden style={styles.toastIcon}>
          {icon === 'success' ? '✓' : '!'}
        </Text>
      )}
      <Text numberOfLines={hasIcon ? 1 : 2} style={styles.toastText}>
        {options.title}
      </Text>
    </View>
  );
}
