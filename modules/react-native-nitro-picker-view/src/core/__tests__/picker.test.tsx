import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { PickerViewColumn } from '../../PickerViewColumn';
import {
  calculateRowAppearance,
  extractColumns,
  extractTextItems,
  normalizePickerOptions,
  normalizePickerValue,
} from '../picker';

describe('picker normalization', () => {
  it('clamps visual options and uses defaults for non-finite values', () => {
    expect(
      normalizePickerOptions({
        edgeFadeIntensity: 2,
        edgeFadeSize: -10,
        itemHeight: Number.NaN,
        magnification: 9,
      }),
    ).toEqual({
      disabled: false,
      edgeFadeIntensity: 1,
      edgeFadeSize: 0,
      itemHeight: 44,
      magnification: 1.6,
    });
  });

  it('normalizes missing, fractional and out-of-range indexes', () => {
    expect(
      normalizePickerValue([-2, 1.9, 99], [['a'], ['a', 'b'], []]),
    ).toEqual([0, 1, 0]);
  });
});

describe('column extraction', () => {
  it('converts string and number children without creating item elements', () => {
    expect(extractTextItems(['one', 2, 'three'])).toEqual([
      'one',
      '2',
      'three',
    ]);
    expect(
      extractColumns(
        [
          createElement(PickerViewColumn, { key: 'a' }, ['x', 'y']),
          createElement(PickerViewColumn, { key: 'b' }, [1, 2]),
        ],
        PickerViewColumn,
      ),
    ).toEqual([
      ['x', 'y'],
      ['1', '2'],
    ]);
  });

  it('rejects arbitrary React elements', () => {
    expect(() => extractTextItems(createElement('span', null, 'bad'))).toThrow(
      /only accepts string or number/,
    );
  });

  it('handles hundreds of items as plain values', () => {
    const items = Array.from({ length: 500 }, (_, index) => `item-${index}`);
    expect(extractTextItems(items)).toEqual(items);
  });
});

describe('magnification curve', () => {
  it('is symmetric, continuous and strongest at the center', () => {
    const center = calculateRowAppearance(0, 44, 1.2);
    const nearLeft = calculateRowAppearance(-22, 44, 1.2);
    const nearRight = calculateRowAppearance(22, 44, 1.2);
    const far = calculateRowAppearance(200, 44, 1.2);

    expect(center).toEqual({ opacity: 1, scale: 1.2 });
    expect(nearLeft).toEqual(nearRight);
    expect(nearLeft.scale).toBeLessThan(center.scale);
    expect(far).toEqual({ opacity: 0.45, scale: 1 });
  });
});
