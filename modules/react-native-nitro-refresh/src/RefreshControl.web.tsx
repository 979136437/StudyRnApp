import { Children } from 'react';

import type { RefreshControlProps } from './types';

/**
 * Web 平台的无操作降级。
 *
 * 文件后缀保证 Metro 在 Web 构建时不会加载 Nitro/Fabric 原生入口；滚动子组件保持
 * 原样渲染，因而不会改变 Web 现有滚动行为，也无需为原生模块提供浏览器桩实现。
 */
export function RefreshControl({
  children,
}: RefreshControlProps): React.JSX.Element {
  return Children.only(children);
}
