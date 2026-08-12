import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import {
  getActivePopupLayers,
  getTopPopupLayer,
  isTopPopupLayer,
} from '../core/active-layers';
import type { InternalPopupController } from '../core/popup-controller';
import type { PopupStoreSnapshot } from '../core/popup-store';
import type { ResolvedPopupOptions } from '../types';
import { PopupLayer } from './PopupLayer';

interface PopupHostProps {
  controllers: readonly InternalPopupController[];
}

const controllerKeys = new WeakMap<InternalPopupController, number>();
let nextControllerKey = 0;

function getControllerKey(controller: InternalPopupController): number {
  const existing = controllerKeys.get(controller);
  if (existing !== undefined) return existing;
  nextControllerKey += 1;
  controllerKeys.set(controller, nextControllerKey);
  return nextControllerKey;
}

interface StoreObserverProps {
  controller: InternalPopupController;
  onSnapshot(
    controller: InternalPopupController,
    snapshot: PopupStoreSnapshot<ResolvedPopupOptions> | null,
  ): void;
}

function StoreObserver({
  controller,
  onSnapshot,
}: StoreObserverProps): React.JSX.Element | null {
  const snapshot = useSyncExternalStore(
    controller.store.subscribe,
    controller.store.getSnapshot,
    controller.store.getSnapshot,
  );

  useEffect(() => {
    onSnapshot(controller, snapshot);
    return () => onSnapshot(controller, null);
  }, [controller, onSnapshot, snapshot]);

  return null;
}

export function PopupHost({ controllers }: PopupHostProps): React.JSX.Element {
  const [snapshots, setSnapshots] = useState(
    () =>
      new Map<
        InternalPopupController,
        PopupStoreSnapshot<ResolvedPopupOptions>
      >(),
  );

  const updateSnapshot = useCallback<StoreObserverProps['onSnapshot']>(
    (controller, snapshot) => {
      setSnapshots((current) => {
        if (snapshot !== null && current.get(controller) === snapshot) {
          return current;
        }
        const next = new Map(current);
        if (snapshot === null) next.delete(controller);
        else next.set(controller, snapshot);
        return next;
      });
    },
    [],
  );

  const activeLayers = useMemo(
    () => getActivePopupLayers(controllers, snapshots),
    [controllers, snapshots],
  );
  const topLayer = getTopPopupLayer(activeLayers);

  return (
    <>
      {controllers.map((controller) => (
        <StoreObserver
          controller={controller}
          key={getControllerKey(controller)}
          onSnapshot={updateSnapshot}
        />
      ))}
      {activeLayers.length === 0 ? null : (
        <Modal
          animationType="none"
          navigationBarTranslucent
          onRequestClose={() => {
            if (topLayer !== undefined) {
              void topLayer.controller.hidePopup(topLayer.item.id);
            }
          }}
          statusBarTranslucent
          transparent
          visible
        >
          <View style={styles.root}>
            {activeLayers.map(({ closing, controller, item }, index) => (
              <PopupLayer
                closing={closing}
                controller={controller}
                interactive={isTopPopupLayer(index, activeLayers.length)}
                key={`${getControllerKey(controller)}:${item.id}`}
                popup={item.value}
              />
            ))}
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
