import { describe, expect, it } from 'vitest';

import {
  getPullReleaseAction,
  normalizeSecondLevelOptions,
} from '../secondLevel';

describe('second level options', () => {
  it('uses a threshold above refresh by default', () => {
    expect(normalizeSecondLevelOptions(80, undefined)).toEqual({
      enabled: false,
      open: false,
      threshold: 160,
    });
  });

  it('routes release to exactly one action', () => {
    expect(getPullReleaseAction(40, 80, 180, true)).toBe('idle');
    expect(getPullReleaseAction(100, 80, 180, true)).toBe('refresh');
    expect(getPullReleaseAction(190, 80, 180, true)).toBe('secondLevel');
    expect(getPullReleaseAction(190, 80, 180, false)).toBe('refresh');
  });
});
