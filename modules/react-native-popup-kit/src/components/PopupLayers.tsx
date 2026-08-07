import { useSyncExternalStore } from 'react';

import { ControllerLayers } from './ControllerLayers';
import type { PopupRenderHost } from '../react/render-host';

export function PopupLayers({
  host,
}: {
  host: PopupRenderHost;
}): React.JSX.Element {
  const controllers = useSyncExternalStore(
    host.subscribe,
    host.getSnapshot,
    host.getSnapshot,
  );

  return (
    <>
      {controllers.map((controller) => (
        <ControllerLayers
          controller={controller}
          key={host.getControllerKey(controller)}
        />
      ))}
    </>
  );
}
