import { useMemo, useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  RecyclerTabItem,
  RecyclerTabViewProps,
} from './RecyclerTabView.types';

export function RecyclerTabView<TTab extends RecyclerTabItem>({
  tabs,
  renderHeader,
  renderScene,
  activeKey: controlledActiveKey,
  defaultActiveKey,
  onActiveKeyChange,
  style,
  testID,
}: RecyclerTabViewProps<TTab>): ReactElement {
  const [localKey, setLocalKey] = useState(
    defaultActiveKey ?? tabs[0]?.key ?? '',
  );
  const activeKey = controlledActiveKey ?? localKey;
  const activeTab = useMemo(
    () => tabs.find((tab) => tab.key === activeKey) ?? tabs[0],
    [activeKey, tabs],
  );

  if (activeTab === undefined) {
    throw new Error(
      '[react-native-nitro-recycler-list] RecyclerTabView 至少需要一个 Tab。',
    );
  }

  return (
    <View style={[styles.container, style]} testID={testID}>
      {renderHeader()}
      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => {
              if (controlledActiveKey === undefined) setLocalKey(tab.key);
              onActiveKeyChange?.(tab.key);
            }}
            style={styles.tab}
          >
            <Text style={tab.key === activeKey && styles.active}>
              {tab.title}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.scene}>{renderScene(activeTab)}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  active: { fontWeight: '800' },
  container: { flex: 1 },
  scene: { flex: 1 },
  tab: { alignItems: 'center', flex: 1, padding: 14 },
  tabBar: { flexDirection: 'row' },
});
