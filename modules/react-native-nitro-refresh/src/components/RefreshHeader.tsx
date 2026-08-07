import { View } from 'react-native';

import { REFRESH_HEADER_MARKER } from '../core/children';
import type { RefreshHeaderProps } from '../types';

/**
 * 标记并渲染自定义刷新头。
 *
 * 此组件本身不持有刷新状态；RefreshLayout 会把它放入原生位移轨迹，并以其固定
 * 数值高度计算触发阈值和刷新保持区。
 */
export function RefreshHeader(props: RefreshHeaderProps): React.JSX.Element {
  return <View {...props} />;
}

Object.assign(RefreshHeader, { [REFRESH_HEADER_MARKER]: true as const });
