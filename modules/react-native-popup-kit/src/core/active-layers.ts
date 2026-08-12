import type { ResolvedPopupOptions } from '../types';
import type { InternalPopupController } from './popup-controller';
import type { PopupItem, PopupStoreSnapshot } from './popup-store';

export interface ActivePopupLayer {
  closing: boolean;
  controller: InternalPopupController;
  item: PopupItem<ResolvedPopupOptions>;
}

export function getActivePopupLayers(
  controllers: readonly InternalPopupController[],
  snapshots: ReadonlyMap<
    InternalPopupController,
    PopupStoreSnapshot<ResolvedPopupOptions>
  >,
): ActivePopupLayer[] {
  const queueLayers: ActivePopupLayer[] = [];
  const stackLayers: ActivePopupLayer[] = [];

  for (const controller of controllers) {
    const snapshot = snapshots.get(controller);
    if (snapshot === undefined) continue;

    if (snapshot.queueCurrent !== null) {
      queueLayers.push({
        closing: snapshot.closingIds.has(snapshot.queueCurrent.id),
        controller,
        item: snapshot.queueCurrent,
      });
    }
    for (const item of snapshot.stack) {
      stackLayers.push({
        closing: snapshot.closingIds.has(item.id),
        controller,
        item,
      });
    }
  }

  stackLayers.sort((left, right) => left.item.order - right.item.order);
  return [...queueLayers, ...stackLayers];
}

export function getTopPopupLayer(
  layers: readonly ActivePopupLayer[],
): ActivePopupLayer | undefined {
  return layers.at(-1);
}

export function isTopPopupLayer(index: number, layerCount: number): boolean {
  return layerCount > 0 && index === layerCount - 1;
}
