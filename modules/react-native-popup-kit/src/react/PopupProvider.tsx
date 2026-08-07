import { use, useLayoutEffect, useState } from 'react';
import { View } from 'react-native';

import { PopupController } from '../core/controller';
import { registerHost } from '../core/registry';
import type { PopupProviderProps } from '../types';
import { PopupContext, PopupRenderHostContext } from './context';
import { PopupLayers } from '../components/PopupLayers';
import { PopupRenderHost } from './render-host';
import { styles } from '../components/styles';

export function PopupProvider({
  children,
  scope = 'local',
  style,
}: PopupProviderProps): React.JSX.Element {
  const [controller] = useState(() => new PopupController());
  const parentRenderHost = use(PopupRenderHostContext);
  const [ownedRenderHost] = useState(() => new PopupRenderHost(controller));
  const ownsRenderHost = scope === 'global' || parentRenderHost === null;
  const renderHost = ownsRenderHost ? ownedRenderHost : parentRenderHost;

  useLayoutEffect(() => {
    controller.mount();
    const unregister = registerHost(controller, scope);
    // 局部控制器仍独立管理状态，但交由根宿主渲染，避免被局部布局裁切。
    const unregisterRenderer = ownsRenderHost
      ? undefined
      : renderHost.register(controller);
    return () => {
      unregisterRenderer?.();
      unregister();
      controller.dispose();
    };
  }, [controller, ownsRenderHost, renderHost, scope]);

  return (
    <PopupContext value={controller}>
      <PopupRenderHostContext value={renderHost}>
        <View
          collapsable={false}
          style={[
            scope === 'global' ? styles.globalHost : styles.localHost,
            style,
          ]}
        >
          {children}
          {ownsRenderHost ? <PopupLayers host={ownedRenderHost} /> : null}
        </View>
      </PopupRenderHostContext>
    </PopupContext>
  );
}
