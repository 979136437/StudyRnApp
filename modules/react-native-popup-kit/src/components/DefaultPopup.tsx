import { View } from 'react-native';

import type { PopupComponentProps } from '../types';
import { styles } from './styles';

export function DefaultPopup({
  id,
  options,
  close,
}: PopupComponentProps): React.JSX.Element {
  const fullscreen = options.placement === 'fullscreen';
  const content =
    typeof options.content === 'function'
      ? options.content({ id, close })
      : options.content;

  return (
    <View
      accessibilityViewIsModal={options.mask ?? true}
      style={[
        styles.popup,
        fullscreen && styles.fullscreenPopup,
        options.style,
      ]}
    >
      {content}
    </View>
  );
}
