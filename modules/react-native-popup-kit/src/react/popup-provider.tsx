import { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PopupController } from '../core/controller';
import { registerHost } from '../core/registry';
import type { PopupProviderProps } from '../types';
import { PopupContext } from './context';
import { PopupLayer } from './popup-layer';
import { styles } from './styles';

export function PopupProvider({
  children,
  scope = 'local',
  style,
}: PopupProviderProps): React.JSX.Element {
  const [controller] = useState(() => new PopupController());
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const insets = useSafeAreaInsets();

  useLayoutEffect(() => {
    controller.mount();
    const unregister = registerHost(controller, scope);
    return () => {
      unregister();
      controller.dispose();
    };
  }, [controller, scope]);

  return (
    <PopupContext value={controller}>
      <View
        collapsable={false}
        style={[
          scope === 'global' ? styles.globalHost : styles.localHost,
          style,
        ]}
      >
        {children}
        {snapshot.visible.map((instance) => (
          <PopupLayer
            controller={controller}
            insets={insets}
            instance={instance}
            key={instance.id}
          />
        ))}
        {snapshot.prompt === null ? null : (
          <PopupLayer
            controller={controller}
            insets={insets}
            instance={snapshot.prompt}
            key={snapshot.prompt.id}
          />
        )}
      </View>
    </PopupContext>
  );
}
