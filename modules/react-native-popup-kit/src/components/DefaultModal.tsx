import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { createModalConfirmationController } from '../modal/modal-confirmation';
import {
  DEFAULT_CANCEL_TEXT,
  DEFAULT_CONFIRM_TEXT,
  resolveModalAction,
} from '../modal/modal-options';
import { resolveModalCustomContent } from '../modal/modal-render';
import type { ModalOptions } from '../modal/types';

interface DefaultModalProps {
  close: () => Promise<void>;
  options: ModalOptions;
}

function renderNode(node: React.ReactNode, style: object): React.ReactNode {
  return typeof node === 'string' || typeof node === 'number' ? (
    <Text style={style}>{node}</Text>
  ) : (
    node
  );
}

export function DefaultModal({
  close,
  options,
}: DefaultModalProps): React.ReactNode {
  const [confirming, setConfirming] = useState(false);
  const confirmationRef = useRef<
    ReturnType<typeof createModalConfirmationController> | undefined
  >(undefined);
  confirmationRef.current ??= createModalConfirmationController(options);
  const confirmation = confirmationRef.current;
  const confirm = resolveModalAction(options.confirm, DEFAULT_CONFIRM_TEXT);
  const cancel = resolveModalAction(options.cancel, DEFAULT_CANCEL_TEXT);

  const onConfirm = useCallback(async (): Promise<void> => {
    if (confirmation.isConfirming()) return;
    setConfirming(true);
    if (await confirmation.confirm()) {
      await close();
      return;
    }
    setConfirming(false);
  }, [close, confirmation]);

  const onCancel = useCallback((): void => {
    if (confirmation.isConfirming()) return;
    confirmation.cancel();
    void close();
  }, [close, confirmation]);

  const customContent = resolveModalCustomContent(options, {
    cancel,
    close,
    confirm,
    confirming,
    onCancel,
    onConfirm,
  });
  if (customContent.kind === 'modal') return customContent.node;

  return (
    <View accessibilityViewIsModal style={styles.root}>
      {options.title === undefined ? null : (
        <View style={styles.title}>
          {renderNode(options.title, styles.titleText)}
        </View>
      )}
      <View style={styles.content}>
        {renderNode(options.content, styles.contentText)}
      </View>
      {options.footerRender === undefined ? (
        <View style={styles.footer}>
          {(options.showCancel ?? true) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: confirming }}
              disabled={confirming}
              onPress={onCancel}
              style={[styles.action, styles.cancelAction, cancel.style]}
            >
              <Text style={styles.cancelText}>{cancel.text}</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: confirming, disabled: confirming }}
            disabled={confirming}
            onPress={() => void onConfirm()}
            style={[styles.action, styles.confirmAction, confirm.style]}
          >
            <Text style={styles.confirmText}>{confirm.text}</Text>
          </Pressable>
        </View>
      ) : (
        customContent.node
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    borderRadius: 5,
    flex: 1,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  cancelAction: { backgroundColor: '#F0F2F4' },
  cancelText: { color: '#17212B', fontSize: 15, fontWeight: '600' },
  confirmAction: { backgroundColor: '#087E5B' },
  confirmText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  content: { paddingHorizontal: 20, paddingVertical: 18 },
  contentText: { color: '#3D4852', fontSize: 15, lineHeight: 22 },
  footer: { flexDirection: 'row', gap: 10, padding: 16, paddingTop: 0 },
  root: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    minWidth: 280,
    overflow: 'hidden',
  },
  title: { borderBottomColor: '#E2E6E9', borderBottomWidth: 1, padding: 18 },
  titleText: { color: '#17212B', fontSize: 18, fontWeight: '700' },
});
