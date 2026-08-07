import { Children, isValidElement } from 'react';

import { isRefreshHeaderElement } from '../core/children';
import type { RefreshLayoutProps } from '../types';

/** Web 不挂载刷新头或 Nitro/Fabric 入口，仅返回调用方提供的滚动组件。 */
export function RefreshLayout({
  children,
}: RefreshLayoutProps): React.JSX.Element | null {
  const scrollable = Children.toArray(children).find(
    (child) => isValidElement(child) && !isRefreshHeaderElement(child),
  );
  return isValidElement(scrollable) ? scrollable : null;
}
