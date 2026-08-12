import { useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';

import {
  activateResponsiveRuntime,
  createResponsiveRuntime,
  deactivateResponsiveRuntime,
} from '../core/responsive-runtime';
import { ResponsiveContext } from './responsive-context';

export type ResponsiveProviderProps = {
  children: ReactNode;
  designWidth: number;
};

export function ResponsiveProvider({
  children,
  designWidth,
}: ResponsiveProviderProps): React.JSX.Element {
  const parentRuntime = useContext(ResponsiveContext);
  const { height, width } = useWindowDimensions();
  const runtime = useMemo(
    () => createResponsiveRuntime(designWidth, width, height),
    [designWidth, height, width],
  );

  if (parentRuntime !== null) {
    throw new Error('ResponsiveProvider cannot be nested.');
  }

  // 独立换算函数必须在子组件渲染前读取到本次窗口快照。
  activateResponsiveRuntime(runtime);

  useEffect(() => {
    // React 严格模式会模拟一次卸载，建立阶段需恢复当前快照。
    activateResponsiveRuntime(runtime);

    return () => {
      deactivateResponsiveRuntime(runtime);
    };
  }, [runtime]);

  return (
    <ResponsiveContext.Provider value={runtime}>
      {children}
    </ResponsiveContext.Provider>
  );
}
