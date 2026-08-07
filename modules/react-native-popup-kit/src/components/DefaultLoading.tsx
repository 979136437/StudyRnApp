import { ActivityIndicator, View } from 'react-native';

import type { LoadingComponentProps } from '../types';
import { DEFAULT_POPUP_APPEARANCE } from './defaults';
import { OptionNode, optionNodeAccessibilityLabel } from './OptionNode';
import { styles } from './styles';

export function DefaultLoading({
  options,
}: LoadingComponentProps): React.JSX.Element {
  const accessibilityTitle = optionNodeAccessibilityLabel(options.title);

  return (
    <View
      accessibilityLabel={accessibilityTitle}
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      style={styles.toast}
    >
      <ActivityIndicator
        color={DEFAULT_POPUP_APPEARANCE.toastTextColor}
        size="large"
      />
      <OptionNode numberOfLines={1} style={styles.toastText}>
        {options.title}
      </OptionNode>
    </View>
  );
}
