import { View } from 'react-native';

import type { PopupComponentProps } from '../types';
import { styles } from './styles';

export function DefaultPopup({
  id,
  options,
  close,
}: PopupComponentProps): React.JSX.Element {
  const content =
    typeof options.content === 'function'
      ? options.content({ id, close })
      : options.content;

  return (
    <View
      accessibilityViewIsModal={options.mask ?? true}
      style={[styles.popup, options.style]}
    >
      {content}
    </View>
  );
}
