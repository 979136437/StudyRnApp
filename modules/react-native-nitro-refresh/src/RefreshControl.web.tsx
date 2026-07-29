import {
  Children,
  forwardRef,
  type ReactElement,
  useImperativeHandle,
} from 'react';

import {
  RefreshPhase,
  type RefreshControlProps,
  type RefreshControlRef,
} from './types';

/**
 * Web 平台的无操作降级。
 *
 * 文件后缀保证 Metro 在 Web 构建时不会加载 Nitro/Fabric 原生入口；滚动子组件保持
 * 原样渲染，因而不会改变 Web 现有滚动行为，也无需为原生模块提供浏览器桩实现。
 */
export const RefreshControl = forwardRef<
  RefreshControlRef,
  RefreshControlProps
>(function RefreshControl(props, ref): React.JSX.Element | null {
  const { children } = props as RefreshControlProps & {
    children?: ReactElement | null;
  };

  useImperativeHandle(
    ref,
    () => ({
      beginRefresh: () => undefined,
      cancelRefresh: () => undefined,
      finishRefresh: () => undefined,
      getState: () => ({
        offset: 0,
        phase: RefreshPhase.IDLE,
        refreshing: false,
      }),
      pullToMax: () => undefined,
    }),
    [],
  );

  if (children == null) {
    if (__DEV__) {
      console.error(
        '[react-native-nitro-refresh] RefreshControl 必须通过滚动组件的 refreshControl 属性使用。',
      );
    }
    return null;
  }

  return Children.only(children);
});
