import { describe, expect, it, vi } from 'vitest';

import { PopupDisplayMode } from '../../constants';
import type { PopupDisplayMode as PopupDisplayModeValue } from '../../types';
import { PopupStore } from '../popup-store';

interface TestPopup {
  displayMode: PopupDisplayModeValue;
  name: string;
}

function createStore(): PopupStore<TestPopup> {
  return new PopupStore((popup) => popup.displayMode);
}

describe('PopupStore', () => {
  it('advances queue items in FIFO order', async () => {
    const store = createStore();
    store.add('first', 1, {
      displayMode: PopupDisplayMode.QUEUE,
      name: 'first',
    });
    store.add('second', 2, {
      displayMode: PopupDisplayMode.QUEUE,
      name: 'second',
    });

    const hidden = store.hide('first');
    expect(store.getSnapshot().closingIds.has('first')).toBe(true);
    store.complete('first');
    await hidden;

    expect(store.getSnapshot().queueCurrent?.id).toBe('second');
  });

  it('shows all stack items immediately in call order', () => {
    const store = createStore();
    store.add('first', 1, {
      displayMode: PopupDisplayMode.STACK,
      name: 'first',
    });
    store.add('second', 2, {
      displayMode: PopupDisplayMode.STACK,
      name: 'second',
    });

    expect(store.getSnapshot().stack.map((item) => item.id)).toEqual([
      'first',
      'second',
    ]);
  });

  it('rejects duplicate ids across queue and stack', () => {
    const store = createStore();
    store.add('same', 1, {
      displayMode: PopupDisplayMode.QUEUE,
      name: 'queue',
    });
    expect(() =>
      store.add('same', 2, {
        displayMode: PopupDisplayMode.STACK,
        name: 'stack',
      }),
    ).toThrow('Popup id already exists');
  });

  it('closes any stack item and resolves duplicate hide calls together', async () => {
    const store = createStore();
    store.add('lower', 1, {
      displayMode: PopupDisplayMode.STACK,
      name: 'lower',
    });
    store.add('upper', 2, {
      displayMode: PopupDisplayMode.STACK,
      name: 'upper',
    });

    const firstHide = store.hide('lower');
    const secondHide = store.hide('lower');
    expect(store.getSnapshot().closingIds.has('lower')).toBe(true);
    store.complete('lower');

    await expect(Promise.all([firstHide, secondHide])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    expect(store.getSnapshot().stack.map((item) => item.id)).toEqual(['upper']);
  });

  it('lets queue advance while stack items stay visible', async () => {
    const store = createStore();
    store.add('queue-1', 1, {
      displayMode: PopupDisplayMode.QUEUE,
      name: 'queue-1',
    });
    store.add('queue-2', 2, {
      displayMode: PopupDisplayMode.QUEUE,
      name: 'queue-2',
    });
    store.add('stack', 3, {
      displayMode: PopupDisplayMode.STACK,
      name: 'stack',
    });

    const hidden = store.hide('queue-1');
    store.complete('queue-1');
    await hidden;

    expect(store.getSnapshot().queueCurrent?.id).toBe('queue-2');
    expect(store.getSnapshot().stack[0]?.id).toBe('stack');
  });

  it('removes queued items before they become visible', async () => {
    const store = createStore();
    store.add('first', 1, {
      displayMode: PopupDisplayMode.QUEUE,
      name: 'first',
    });
    store.add('second', 2, {
      displayMode: PopupDisplayMode.QUEUE,
      name: 'second',
    });

    await store.hide('second');

    expect(store.getSnapshot().ids).toEqual(['first']);
  });

  it('treats unknown ids as idempotent success', async () => {
    const store = createStore();
    await expect(store.hide('missing')).resolves.toBeUndefined();
  });

  it('resolves pending hides and clears all modes on dispose', async () => {
    const store = createStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.add('queue', 1, {
      displayMode: PopupDisplayMode.QUEUE,
      name: 'queue',
    });
    store.add('stack', 2, {
      displayMode: PopupDisplayMode.STACK,
      name: 'stack',
    });
    const queueHide = store.hide('queue');
    const stackHide = store.hide('stack');

    store.dispose();

    await expect(Promise.all([queueHide, stackHide])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    expect(store.getSnapshot()).toMatchObject({
      ids: [],
      queueCurrent: null,
      stack: [],
    });
    expect(() =>
      store.add('later', 3, {
        displayMode: PopupDisplayMode.QUEUE,
        name: 'later',
      }),
    ).toThrow('unmounted');
  });
});
