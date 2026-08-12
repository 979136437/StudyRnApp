import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { PopupProvider } from 'react-native-popup-kit';
import {
  hideModal,
  showModal,
  useModal,
  type ModalFooterRenderProps,
  type ModalRenderProps,
} from 'react-native-popup-kit/modal';
import {
  hideToast,
  showToast,
  ToastPosition,
  ToastType,
} from 'react-native-popup-kit/toast';

import { popupComponentsStyles as styles } from './popup-components-styles';

interface ActionProps {
  label: string;
  onPress: () => void;
  primary?: boolean;
}

function Action({
  label,
  onPress,
  primary = false,
}: ActionProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.action, primary && styles.actionPrimary]}
    >
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>
        {label}
      </Text>
    </Pressable>
  );
}

function CustomFooter({
  cancel,
  confirm,
  confirming,
  onCancel,
  onConfirm,
}: ModalFooterRenderProps): React.JSX.Element {
  return (
    <View style={styles.footer}>
      <Action label={cancel.text} onPress={onCancel} />
      <Action
        label={confirming ? '处理中' : confirm.text}
        onPress={() => void onConfirm()}
        primary
      />
    </View>
  );
}

function CustomModal({
  close,
  confirm,
  confirming,
  content,
  onConfirm,
  title,
}: ModalRenderProps): React.JSX.Element {
  return (
    <View style={styles.customModal}>
      <Text style={styles.customModalTitle}>{title}</Text>
      <Text style={styles.actionText}>{content}</Text>
      <View style={styles.actions}>
        <Action label="直接关闭" onPress={() => void close()} />
        <Action
          label={confirming ? '处理中' : confirm.text}
          onPress={() => void onConfirm()}
          primary
        />
      </View>
    </View>
  );
}

function LocalModalTests({
  report,
}: {
  report: (value: string) => void;
}): React.JSX.Element {
  const modal = useModal();
  return (
    <View style={styles.localContent}>
      <Text style={styles.title}>局部 Modal</Text>
      <View style={styles.actions}>
        <Action
          label="显示局部 Modal"
          onPress={() =>
            void modal.showModal({
              content: '由测试页内最近的 PopupProvider 管理。',
              onClose: () => report('局部 Modal 已关闭'),
              title: '局部作用域',
            })
          }
          primary
        />
        <Action label="关闭局部顶层" onPress={() => void modal.hideModal()} />
      </View>
    </View>
  );
}

export function PopupComponentsScreen(): React.JSX.Element {
  const [status, setStatus] = useState('等待测试');
  const [duration, setDuration] = useState('2000');
  const parsedDuration = Number(duration);
  const toastDuration = Number.isFinite(parsedDuration)
    ? parsedDuration
    : undefined;

  const openConfirmation = (
    result: true | false | 'reject',
    customFooter = false,
  ): void => {
    void showModal({
      confirm: { text: '提交' },
      content: `确认回调结果：${String(result)}`,
      footerRender: customFooter
        ? (props) => <CustomFooter {...props} />
        : undefined,
      onClose: () => setStatus('全局 Modal onClose'),
      onConfirm: async () => {
        setStatus('onConfirm 执行中');
        if (result === 'reject') throw new Error('测试拒绝');
        setStatus(`onConfirm 返回 ${String(result)}`);
        return result;
      },
      title: customFooter ? '自定义 footerRender' : '异步确认',
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <View style={styles.section}>
        <Text style={styles.title}>最近结果</Text>
        <Text selectable style={styles.status}>
          {status}
        </Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.title}>Toast</Text>
        <TextInput
          keyboardType="number-pad"
          onChangeText={setDuration}
          placeholder="duration"
          style={styles.input}
          value={duration}
        />
        <View style={styles.actions}>
          <Action
            label="成功 · top"
            onPress={() =>
              void showToast({
                duration: toastDuration,
                message: '操作成功',
                onClose: () => setStatus('success Toast onClose'),
                position: ToastPosition.TOP,
                type: ToastType.SUCCESS,
              })
            }
            primary
          />
          <Action
            label="错误 · center"
            onPress={() =>
              void showToast({
                duration: toastDuration,
                message: '操作失败',
                position: ToastPosition.CENTER,
                type: ToastType.ERROR,
              })
            }
          />
          <Action
            label="无图标 · bottom"
            onPress={() =>
              void showToast({
                duration: toastDuration,
                message: '普通通知',
                position: ToastPosition.BOTTOM,
                type: ToastType.NONE,
              })
            }
          />
          <Action
            label="自定义图标"
            onPress={() =>
              void showToast({
                icon: <Text>自定义</Text>,
                message: 'icon 优先',
                type: ToastType.SUCCESS,
              })
            }
          />
          <Action
            label="持续 loading"
            onPress={() =>
              void showToast({ message: '处理中', type: ToastType.LOADING })
            }
          />
          <Action
            label="连续三项 FIFO"
            onPress={() => {
              void showToast({ message: '队列 1' });
              void showToast({ message: '队列 2' });
              void showToast({ message: '队列 3' });
              setStatus('已加入三项 Toast');
            }}
          />
          <Action
            label="隐藏当前 Toast"
            onPress={() =>
              void hideToast().then(() => setStatus('hideToast 完成'))
            }
          />
        </View>
      </View>
      <View style={styles.section}>
        <Text style={styles.title}>全局 Modal</Text>
        <View style={styles.actions}>
          <Action
            label="默认 Modal"
            onPress={() =>
              void showModal({
                content: '默认确认和取消按钮',
                onCancel: () => setStatus('onCancel'),
                onClose: () => setStatus('onClose'),
                title: '默认配置',
              })
            }
            primary
          />
          <Action label="确认 true" onPress={() => openConfirmation(true)} />
          <Action label="确认 false" onPress={() => openConfirmation(false)} />
          <Action
            label="确认 reject"
            onPress={() => openConfirmation('reject')}
          />
          <Action
            label="自定义 footer"
            onPress={() => openConfirmation(true, true)}
          />
          <Action
            label="整体 render"
            onPress={() =>
              void showModal({
                content: '默认白色容器已被完全替换。',
                render: (props) => <CustomModal {...props} />,
                title: '自定义整体样式',
              })
            }
          />
          <Action
            label="无默认取消"
            onPress={() =>
              void showModal({
                content: '只显示默认确认按钮',
                showCancel: false,
              })
            }
          />
          <Action
            label="叠加两个 Modal"
            onPress={() => {
              void showModal({ content: '底层 Modal', title: '第一层' });
              void showModal({ content: '顶层 Modal', title: '第二层' });
            }}
          />
          <Action
            label="关闭全局顶层"
            onPress={() =>
              void hideModal().then(() => setStatus('hideModal 完成'))
            }
          />
        </View>
      </View>
      <PopupProvider>
        <LocalModalTests report={setStatus} />
      </PopupProvider>
    </ScrollView>
  );
}
