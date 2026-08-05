import { Text, View } from 'react-native';
import { useModal, useToast } from 'react-native-popup-kit';

import { DemoButton } from './demo-button';
import { popupDemoStyles as styles } from './styles';

export function LocalPopupExamples(): React.JSX.Element {
  const { showToast } = useToast();
  const { showModal } = useModal();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>局部 Hooks</Text>
        <Text style={styles.sectionMeta}>局部 Provider</Text>
      </View>
      <View style={styles.actions}>
        <DemoButton
          label="局部 Toast"
          onPress={() =>
            showToast({ icon: 'none', title: '只在局部宿主内显示' })
          }
        />
        <DemoButton
          label="局部 Modal"
          onPress={() => {
            void showModal({
              content: '该弹窗由 useModal 调用。',
              title: '局部作用域',
            }).catch(() => undefined);
          }}
        />
      </View>
    </View>
  );
}
