import { Modal } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { MediaPickerModalProps } from '../types';
import { MediaPickerView } from './MediaPickerView';

export function MediaPickerModal({
  animationType = 'slide',
  onRequestClose,
  visible,
  ...pickerProps
}: MediaPickerModalProps): React.JSX.Element {
  return (
    <Modal
      animationType={animationType}
      navigationBarTranslucent
      onRequestClose={onRequestClose ?? pickerProps.onCancel}
      statusBarTranslucent
      visible={visible}
    >
      {visible ? (
        <SafeAreaProvider>
          <MediaPickerView {...pickerProps} />
        </SafeAreaProvider>
      ) : null}
    </Modal>
  );
}
