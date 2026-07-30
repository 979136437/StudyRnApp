import type { SecondLevelOptions } from '../types';

export interface NormalizedSecondLevelOptions {
  enabled: boolean;
  open: boolean;
  threshold: number;
}

/** 统一校验双阈值，确保原生状态机不会收到相等或倒置的阈值。 */
export function normalizeSecondLevelOptions(
  refreshThreshold: number,
  options: SecondLevelOptions | undefined,
): NormalizedSecondLevelOptions {
  const firstThreshold = Math.max(1, refreshThreshold);
  const fallback = Math.max(firstThreshold * 2, 160);
  const requested = options?.threshold ?? fallback;

  if (options !== undefined && requested <= firstThreshold && __DEV__) {
    throw new Error(
      '[react-native-nitro-recycler-list] secondLevel.threshold 必须大于 refreshThreshold。',
    );
  }

  return {
    enabled: options !== undefined && (options.enabled ?? true),
    open: options?.open ?? false,
    threshold: Math.max(firstThreshold + 1, requested),
  };
}

export function getPullReleaseAction(
  offset: number,
  refreshThreshold: number,
  secondLevelThreshold: number,
  secondLevelEnabled: boolean,
): 'idle' | 'refresh' | 'secondLevel' {
  if (secondLevelEnabled && offset >= secondLevelThreshold) {
    return 'secondLevel';
  }
  return offset >= refreshThreshold ? 'refresh' : 'idle';
}
