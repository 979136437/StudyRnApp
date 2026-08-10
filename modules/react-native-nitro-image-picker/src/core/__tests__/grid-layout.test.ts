import { describe, expect, it } from 'vitest';

import {
  calculateGridCellSize,
  normalizeMeasuredWidth,
} from '../grid-layout';

describe('media grid layout', () => {
  it('waits for a valid measured width', () => {
    expect(normalizeMeasuredWidth(0)).toBeUndefined();
    expect(calculateGridCellSize(undefined, 4, 4, 4)).toBeUndefined();
  });

  it('rounds equivalent measurements and creates square four-column cells', () => {
    expect(normalizeMeasuredWidth(447.6)).toBe(448);
    expect(normalizeMeasuredWidth(448.4)).toBe(448);
    expect(calculateGridCellSize(448, 4, 4, 4)).toBe(106);
  });

  it('recalculates deterministically after a width change', () => {
    expect(calculateGridCellSize(960, 4, 4, 4)).toBe(234);
  });
});
