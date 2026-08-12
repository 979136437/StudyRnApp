import { useMemo, useSyncExternalStore } from 'react';
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

interface ControllerSnapshotSource {
  getSnapshot(): readonly PopupStoreSnapshot<ResolvedPopupOptions>[];
  subscribe(listener: () => void): () => void;
}

function createControllerSnapshotSource(
  controllers: readonly InternalPopupController[],
): ControllerSnapshotSource {
  let snapshot = controllers.map((controller) =>
    controller.store.getSnapshot(),
  );
  const listeners = new Set<() => void>();
  let unsubscribers: (() => void)[] = [];

  const update = (): void => {
    const next = controllers.map((controller) =>
      controller.store.getSnapshot(),
    );
    if (
      next.length === snapshot.length &&
      next.every((value, index) => value === snapshot[index])
    )
      return;
    snapshot = next;
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener): () => void {
      listeners.add(listener);
      if (listeners.size === 1) {
        unsubscribers = controllers.map((controller) =>
          controller.store.subscribe(update),
        );
        update();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        for (const unsubscribe of unsubscribers) unsubscribe();
        unsubscribers = [];
      };
    },
  };
}

export function PopupHost({ controllers }: PopupHostProps): React.JSX.Element {
  const snapshotSource = useMemo(
    () => createControllerSnapshotSource(controllers),
    [controllers],
  );
  const controllerSnapshots = useSyncExternalStore(
    snapshotSource.subscribe,
    snapshotSource.getSnapshot,
    snapshotSource.getSnapshot,
  );
  const snapshots = useMemo(() => {
    const next = new Map<
      InternalPopupController,
      PopupStoreSnapshot<ResolvedPopupOptions>
    >();
    controllers.forEach((controller, index) => {
      const snapshot = controllerSnapshots[index];
      if (snapshot !== undefined) next.set(controller, snapshot);
    });
    return next;
  }, [controllerSnapshots, controllers]);

  const activeLayers = useMemo(
    () => getActivePopupLayers(controllers, snapshots),
    [controllers, snapshots],
  );
  const topLayer = getTopPopupLayer(activeLayers);

  return (
    <>
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
