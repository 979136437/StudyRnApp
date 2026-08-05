import { Pressable, Text, TextInput, View } from 'react-native';

import type { ModalComponentProps } from '../types';
import { DEFAULT_POPUP_APPEARANCE } from './defaults';
import { styles } from './styles';

export function DefaultModal({
  options,
  value,
  onChangeText,
  onConfirm,
  onCancel,
}: ModalComponentProps): React.JSX.Element {
  const showCancel = options.showCancel ?? true;

  return (
    <View
      accessibilityRole="alert"
      accessibilityViewIsModal
      style={styles.modal}
    >
      <View style={styles.modalBody}>
        {options.title ? (
          <Text style={styles.modalTitle}>{options.title}</Text>
        ) : null}
        {options.content ? (
          <Text selectable style={styles.modalContent}>
            {options.content}
          </Text>
        ) : null}
        {options.editable ? (
          <TextInput
            accessibilityLabel={options.placeholderText ?? '弹窗输入框'}
            onChangeText={onChangeText}
            placeholder={options.placeholderText}
            placeholderTextColor={
              DEFAULT_POPUP_APPEARANCE.modalSecondaryTextColor
            }
            style={styles.modalInput}
            value={value}
          />
        ) : null}
      </View>
      <View style={styles.modalActions}>
        {showCancel ? (
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            style={({ pressed }) => [
              styles.modalButton,
              styles.modalCancelButton,
              { opacity: pressed ? 0.55 : 1 },
            ]}
          >
            <Text
              style={[
                styles.modalButtonText,
                {
                  color:
                    options.cancelColor ?? DEFAULT_POPUP_APPEARANCE.cancelColor,
                },
              ]}
            >
              {options.cancelText ?? '取消'}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={onConfirm}
          style={({ pressed }) => [
            styles.modalButton,
            { opacity: pressed ? 0.55 : 1 },
          ]}
        >
          <Text
            style={[
              styles.modalButtonText,
              {
                color:
                  options.confirmColor ?? DEFAULT_POPUP_APPEARANCE.confirmColor,
              },
            ]}
          >
            {options.confirmText ?? '确定'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
