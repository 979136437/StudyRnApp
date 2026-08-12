/* Legacy demo retained as inactive source during the popup-kit rewrite.
import { Text, View } from 'react-native';
import type { PopupComponentProps } from 'react-native-popup-kit';

import { DemoButton } from './demo-button';
import { popupDemoStyles as styles } from './styles';

export function BottomPopupExample({
  close,
}: PopupComponentProps): React.JSX.Element {
  return (
    <View style={styles.bottomPopup}>
      <View style={styles.popupHandle} />
      <Text style={styles.popupTitle}>自定义底部 Popup</Text>
      <DemoButton label="完成" onPress={() => void close()} primary />
    </View>
  );
}
*/
export {};
