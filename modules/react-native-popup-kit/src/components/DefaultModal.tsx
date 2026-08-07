import { Pressable, TextInput, View } from 'react-native';

import type { ModalComponentProps } from '../types';
import { DEFAULT_POPUP_APPEARANCE } from './defaults';
import { OptionNode } from './OptionNode';
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
        {options.title !== undefined && options.title !== null ? (
          <OptionNode style={styles.modalTitle}>{options.title}</OptionNode>
        ) : null}
        {options.content !== undefined && options.content !== null ? (
          <OptionNode selectable style={styles.modalContent}>
            {options.content}
          </OptionNode>
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
            style={[styles.modalButton, styles.modalCancelButton]}
          >
            <OptionNode
              style={[
                styles.modalButtonText,
                {
                  color:
                    options.cancelColor ?? DEFAULT_POPUP_APPEARANCE.cancelColor,
                },
              ]}
            >
              {options.cancelText ?? '取消'}
            </OptionNode>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={onConfirm}
          style={styles.modalButton}
        >
          <OptionNode
            style={[
              styles.modalButtonText,
              {
                color:
                  options.confirmColor ?? DEFAULT_POPUP_APPEARANCE.confirmColor,
              },
            ]}
          >
            {options.confirmText ?? '确定'}
          </OptionNode>
        </Pressable>
      </View>
    </View>
  );
}
