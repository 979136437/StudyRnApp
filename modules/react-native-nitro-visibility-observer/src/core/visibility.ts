import {
  DEFAULT_MEASUREMENT_INTERVAL_MS,
  DEFAULT_MINIMUM_VISIBLE_DURATION_MS,
  DEFAULT_THRESHOLD,
  MINIMUM_MEASUREMENT_INTERVAL_MS,
} from './constants';

export type NormalizedVisibilityOptions = Readonly<{
  enabled: boolean;
  measurementIntervalMs: number;
  minimumVisibleDurationMs: number;
  threshold: number;
}>;

function finiteOrDefault(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function normalizeVisibilityOptions(options: {
  enabled?: boolean;
  measurementIntervalMs?: number;
  minimumVisibleDurationMs?: number;
  threshold?: number;
}): NormalizedVisibilityOptions {
  return {
    enabled: options.enabled ?? true,
    measurementIntervalMs: Math.max(
      MINIMUM_MEASUREMENT_INTERVAL_MS,
      finiteOrDefault(
        options.measurementIntervalMs,
        DEFAULT_MEASUREMENT_INTERVAL_MS,
      ),
    ),
    minimumVisibleDurationMs: Math.max(
      0,
      finiteOrDefault(
        options.minimumVisibleDurationMs,
        DEFAULT_MINIMUM_VISIBLE_DURATION_MS,
      ),
    ),
    threshold: Math.min(
      1,
      Math.max(0, finiteOrDefault(options.threshold, DEFAULT_THRESHOLD)),
    ),
  };
}

export function meetsVisibilityThreshold(
  visibleRatio: number,
  threshold: number,
): boolean {
  // threshold=0 表示任意正面积相交，避免 0 >= 0 将完全不可见误判为可见。
  return visibleRatio > 0 && visibleRatio >= threshold;
}
