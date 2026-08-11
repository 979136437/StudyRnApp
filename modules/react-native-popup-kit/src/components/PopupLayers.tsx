import { useSyncExternalStore } from 'react';
import { Modal, View } from 'react-native';

import { resolvePopupLayerMode } from '../core/layer-mode';
import { requestPopupBack } from '../core/registry';
import type { PopupRenderHost } from '../react/render-host';
import type { PopupLayerMode } from '../types';
import { ControllerLayers } from './ControllerLayers';
import { styles } from './styles';

declare const process: { env: { EXPO_OS?: string } };

export function PopupLayers({
  host,
  layerMode,
}: {
  host: PopupRenderHost;
  layerMode?: PopupLayerMode;
}): React.JSX.Element {
  const controllers = useSyncExternalStore(
    host.subscribe,
    host.getSnapshot,
    host.getSnapshot,
  );
  const hasVisibleLayers = useSyncExternalStore(
    host.subscribeLayers,
    host.getLayerSnapshot,
    host.getLayerSnapshot,
  );

  const layers = controllers.map((controller) => (
    <ControllerLayers
      controller={controller}
      key={host.getControllerKey(controller)}
    />
  ));

  if (resolvePopupLayerMode(layerMode, process.env.EXPO_OS) === 'inline') {
    return <>{layers}</>;
  }

  return (
    <Modal
      animationType="none"
      hardwareAccelerated
      navigationBarTranslucent
      onRequestClose={() => requestPopupBack()}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={hasVisibleLayers}
    >
      <View style={styles.nativeHost}>{layers}</View>
    </Modal>
  );
}
