import { useSyncExternalStore } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PopupController } from '../core/controller';
import { PopupLayer } from './popup-layer';

export function ControllerLayers({
  controller,
}: {
  controller: PopupController;
}): React.JSX.Element {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const insets = useSafeAreaInsets();

  return (
    <>
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
    </>
  );
}
