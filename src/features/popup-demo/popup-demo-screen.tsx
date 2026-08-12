/* Legacy demo retained as inactive source during the popup-kit rewrite.
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  PopupProvider,
  closeAllPopups,
  closePopup,
  hideLoading,
  showLoading,
  showModal,
  showPopup,
  showToast,
  type PopupId,
} from 'react-native-popup-kit';

import { BottomPopupExample } from './bottom-popup-example';
import { DemoButton } from './demo-button';
import { LocalPopupExamples } from './local-popup-examples';
import { popupDemoStyles as styles } from './styles';

function openGlobalModal(): void {
  void showModal({
    content: '输入备注并确认，结果会通过 Promise 返回。',
    editable: true,
    placeholderText: '备注',
    title: '全局 Modal',
  }).then(
    (result) => {
      showToast({
        icon: result.confirm ? 'success' : 'none',
        title: result.confirm
          ? `已确认：${result.content || '无备注'}`
          : '已取消',
      });
    },
    () => undefined,
  );
}

function closeEveryPopup(): void {
  void closeAllPopups().then((result) => {
    showToast({ icon: 'none', title: `已关闭 ${result.closed} 个弹窗` });
  });
}

export function PopupDemoScreen(): React.JSX.Element {
  const [activePopupId, setActivePopupId] = useState<PopupId | null>(null);

  const openCustomPopup = (): void => {
    const task = showPopup({
      component: BottomPopupExample,
      placement: 'bottom',
    });
    setActivePopupId(task.id);
    void task.then(
      () =>
        setActivePopupId((currentId) =>
          currentId === task.id ? null : currentId,
        ),
      () =>
        setActivePopupId((currentId) =>
          currentId === task.id ? null : currentId,
        ),
    );
  };

  const closeCurrentPopup = (): void => {
    if (activePopupId === null) {
      showToast({ icon: 'none', title: '当前没有可关闭的 Popup' });
      return;
    }
    void closePopup(activePopupId);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      style={styles.screen}
    >
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>基础反馈</Text>
          <Text style={styles.sectionMeta}>全局 API</Text>
        </View>
        <View style={styles.actions}>
          <DemoButton
            label="Toast"
            onPress={() =>
              showToast({ icon: 'success', title: '全局 Toast 已显示' })
            }
          />
          <DemoButton
            label="Loading"
            onPress={() => showLoading({ title: '正在处理' })}
          />
          <DemoButton
            label="关闭 Loading"
            onPress={() => void hideLoading({ noConflict: true })}
          />
          <DemoButton label="Modal" onPress={openGlobalModal} />
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>弹窗管理</Text>
          <Text style={styles.sectionMeta}>Popup API</Text>
        </View>
        <View style={styles.actions}>
          <DemoButton label="底部 Popup" onPress={openCustomPopup} />
          <DemoButton
            disabled={activePopupId === null}
            label="关闭当前"
            onPress={closeCurrentPopup}
          />
          <DemoButton label="关闭全部" onPress={closeEveryPopup} />
        </View>
      </View>

      <PopupProvider scope="local">
        <LocalPopupExamples />
      </PopupProvider>
    </ScrollView>
  );
}
*/
export { PopupDemoScreen } from './popup-test-screen';
