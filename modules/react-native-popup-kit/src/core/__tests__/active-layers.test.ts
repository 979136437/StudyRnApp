import { describe, expect, it } from 'vitest';

import { PopupDisplayMode } from '../../constants';
import {
  getActivePopupLayers,
  getTopPopupLayer,
  isTopPopupLayer,
} from '../active-layers';
import { createPopupController } from '../popup-controller';

describe('getActivePopupLayers', () => {
  it('renders provider queues first and stacks by global call order', async () => {
    const globalController = createPopupController();
    const localController = createPopupController();
    await globalController.showPopup({
      children: 'global',
      displayMode: PopupDisplayMode.QUEUE,
      id: 'global',
    });
    await localController.showPopup({
      children: 'local-stack-1',
      displayMode: PopupDisplayMode.STACK,
      id: 'local-stack-1',
    });
    await globalController.showPopup({
      children: 'global-stack-2',
      displayMode: PopupDisplayMode.STACK,
      id: 'global-stack-2',
    });
    const snapshots = new Map([
      [globalController, globalController.store.getSnapshot()],
      [localController, localController.store.getSnapshot()],
    ]);

    const layers = getActivePopupLayers(
      [globalController, localController],
      snapshots,
    );

    expect(layers.map((layer) => layer.item.id)).toEqual([
      'global',
      'local-stack-1',
      'global-stack-2',
    ]);
    expect(getTopPopupLayer(layers)?.item.id).toBe('global-stack-2');
    expect(
      layers.map((_, index) => isTopPopupLayer(index, layers.length)),
    ).toEqual([false, false, true]);
  });

  it('omits controllers without visible popups', async () => {
    const globalController = createPopupController();
    const localController = createPopupController();
    await globalController.showPopup({
      children: 'global',
      displayMode: PopupDisplayMode.QUEUE,
      id: 'global',
    });
    const snapshots = new Map([
      [globalController, globalController.store.getSnapshot()],
      [localController, localController.store.getSnapshot()],
    ]);

    const layers = getActivePopupLayers(
      [globalController, localController],
      snapshots,
    );

    expect(layers).toHaveLength(1);
    expect(layers[0]?.item.id).toBe('global');
  });

  it('has no top or interactive layer when every controller is empty', () => {
    expect(getTopPopupLayer([])).toBeUndefined();
    expect(isTopPopupLayer(0, 0)).toBe(false);
  });
});
