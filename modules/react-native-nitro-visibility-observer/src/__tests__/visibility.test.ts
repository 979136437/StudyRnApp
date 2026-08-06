import { afterEach, describe, expect, it, vi } from 'vitest';

import { VisibilityTransitionController } from '../core/transition';
import {
  normalizeVisibilityOptions,
  meetsVisibilityThreshold,
} from '../core/visibility';

afterEach(() => {
  vi.useRealTimers();
});

describe('normalizeVisibilityOptions', () => {
  it('applies defaults and clamps invalid ranges', () => {
    expect(normalizeVisibilityOptions({})).toEqual({
      enabled: true,
      measurementIntervalMs: 100,
      minimumVisibleDurationMs: 0,
      threshold: 0.5,
    });
    expect(
      normalizeVisibilityOptions({
        measurementIntervalMs: 1,
        minimumVisibleDurationMs: -10,
        threshold: 2,
      }),
    ).toEqual({
      enabled: true,
      measurementIntervalMs: 16,
      minimumVisibleDurationMs: 0,
      threshold: 1,
    });
  });

  it('treats threshold zero as any positive intersection', () => {
    expect(meetsVisibilityThreshold(0, 0)).toBe(false);
    expect(meetsVisibilityThreshold(0.001, 0)).toBe(true);
  });
});

describe('VisibilityTransitionController', () => {
  it('publishes the initial result and threshold transitions only', () => {
    const publish = vi.fn();
    const controller = new VisibilityTransitionController(0.5, 0, publish);

    controller.update(0, true);
    controller.update(0.2, true);
    controller.update(0.5, true);
    controller.update(0.8, true);
    controller.update(0.1, true);

    expect(publish.mock.calls).toEqual([
      [{ isVisible: false, visibleRatio: 0 }],
      [{ isVisible: true, visibleRatio: 0.5 }],
      [{ isVisible: false, visibleRatio: 0.1 }],
    ]);
  });

  it('delays entry and cancels it when the element leaves early', () => {
    vi.useFakeTimers();
    const publish = vi.fn();
    const controller = new VisibilityTransitionController(0.5, 300, publish);

    controller.update(0.8, true);
    vi.advanceTimersByTime(200);
    controller.update(0, true);
    vi.advanceTimersByTime(200);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenLastCalledWith({
      isVisible: false,
      visibleRatio: 0,
    });
  });

  it('publishes visible after the minimum duration and exits immediately', () => {
    vi.useFakeTimers();
    const publish = vi.fn();
    const controller = new VisibilityTransitionController(0.5, 300, publish);

    controller.update(0.8, true);
    vi.advanceTimersByTime(300);
    controller.update(0.8, false);

    expect(publish.mock.calls).toEqual([
      [{ isVisible: true, visibleRatio: 0.8 }],
      [{ isVisible: false, visibleRatio: 0.8 }],
    ]);
  });
});
