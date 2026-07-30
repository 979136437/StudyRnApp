import type { ReactElement, ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import type { RecyclerListProps } from './types';

/** 折叠多页中的最小 Tab 描述。 */
export interface RecyclerTabItem {
  /** 跨渲染稳定且在当前 Tab 集合中唯一的键。 */
  key: string;
  /** 默认 Tab 栏显示的标题。 */
  title: string;
}

/** 自定义 Tab 栏接收的受控切换与折叠动画上下文。 */
export interface RecyclerTabBarContext<TTab extends RecyclerTabItem> {
  tabs: readonly TTab[];
  activeKey: string;
  selectTab(key: string): void;
  collapseOffset: SharedValue<number>;
  collapseProgress: SharedValue<number>;
}

/** 共享折叠头多页容器属性。 */
export interface RecyclerTabViewProps<TTab extends RecyclerTabItem> {
  tabs: readonly TTab[];
  renderHeader(): ReactNode;
  renderScene(tab: TTab): ReactElement<RecyclerListProps<unknown>>;
  renderTabBar?: (context: RecyclerTabBarContext<TTab>) => ReactNode;
  activeKey?: string;
  defaultActiveKey?: string;
  onActiveKeyChange?: (key: string) => void;
  collapsedHeaderHeight?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}
