import { afterEach, describe, expect, it, vi } from 'vitest';

import { normalizeVisibilityOptions } from '../core/visibility';
import { observeWebVisibility } from '../web-observer';

class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('observeWebVisibility', () => {
  it('combines intersection and document foreground state', () => {
    const fakeDocument = new FakeDocument();
    let intersectionCallback: IntersectionObserverCallback | undefined;
    const disconnect = vi.fn();
    const observe = vi.fn();

    class FakeIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }

      disconnect = disconnect;
      observe = observe;
      takeRecords = () => [];
      unobserve = vi.fn();
      root = null;
      rootMargin = '0px';
      thresholds = [0, 0.5];
    }

    vi.stubGlobal('document', fakeDocument);
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    const onChange = vi.fn();
    const cleanup = observeWebVisibility(
      {} as Element,
      normalizeVisibilityOptions({ threshold: 0.5 }),
      onChange,
    );

    intersectionCallback?.(
      [
        {
          intersectionRatio: 0.8,
          isIntersecting: true,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    fakeDocument.visibilityState = 'hidden';
    fakeDocument.dispatchEvent(new Event('visibilitychange'));

    expect(observe).toHaveBeenCalledOnce();
    expect(onChange.mock.calls).toEqual([
      [{ isVisible: true, visibleRatio: 0.8 }],
      [{ isVisible: false, visibleRatio: 0.8 }],
    ]);

    cleanup();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
