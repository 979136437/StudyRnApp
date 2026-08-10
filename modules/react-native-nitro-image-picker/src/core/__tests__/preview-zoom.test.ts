import { describe, expect, it } from 'vitest';

import {
  clampPreviewScale,
  clampPreviewTranslation,
  previewPanBounds,
  previewTouchDistance,
} from '../preview-zoom';

describe('preview zoom math', () => {
  it('clamps invalid and out-of-range scales', () => {
    expect(clampPreviewScale(Number.NaN)).toBe(1);
    expect(clampPreviewScale(0.5)).toBe(1);
    expect(clampPreviewScale(2.5)).toBe(2.5);
    expect(clampPreviewScale(6)).toBe(4);
  });

  it('calculates pan bounds from the scaled viewport', () => {
    expect(previewPanBounds(200, 100, 3)).toEqual({ x: 200, y: 100 });
  });

  it('clamps translations inside the visible scaled content', () => {
    expect(
      clampPreviewTranslation({ x: 300, y: -150 }, 200, 100, 3),
    ).toEqual({ x: 200, y: -100 });
    expect(clampPreviewTranslation({ x: 10, y: 10 }, 200, 100, 1)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('calculates the distance between two touches', () => {
    expect(
      previewTouchDistance(
        { pageX: 0, pageY: 0 },
        { pageX: 3, pageY: 4 },
      ),
    ).toBe(5);
  });
});
