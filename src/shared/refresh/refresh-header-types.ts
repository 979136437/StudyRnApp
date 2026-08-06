import type { ReactElement } from 'react';
import type { ViewStyle } from 'react-native';
import type { RefreshOffsetEvent } from 'react-native-nitro-refresh';

/** 普通刷新头与动画刷新头共用的受控行为、阈值和容器属性。 */
export interface RefreshHeaderBaseProps {
  /** 受控刷新状态。 */
  refreshing: boolean;
  /** 用户松手进入刷新状态时调用。 */
  onRefresh?: () => void;
  /** 是否允许用户下拉刷新，默认为 true。 */
  enable?: boolean;
  /** 刷新内容高度及第一刷新阈值，单位为 dp/pt，默认为 80。 */
  height?: number;
  /** 可选二级下拉阈值；未提供时不会进入 Max 或调用 onMax。 */
  maxDistance?: number;
  /** 连续下拉位移回调，offset 单位为 dp/pt。 */
  onChangeOffset?: (event: RefreshOffsetEvent) => void;
  /** 达到显式配置的二级下拉阈值时调用。 */
  onMax?: () => void;
  /** Android 包裹的纵向滚动组件；作为 refreshControl 使用时通常无需手动传入。 */
  children?: ReactElement | null;
  /** 刷新头外层样式。 */
  containerStyle?: ViewStyle;
}
