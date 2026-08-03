import { describe, expect, it } from 'vitest';

import { translateVisibleRange } from '../visibleRange';

describe('translateVisibleRange', () => {
  it('translates descriptor indices into data indices', () => {
    expect(translateVisibleRange({ first: 1, last: 3 }, 5, 1)).toEqual({
      first: 0,
      last: 2,
    });
  });

  it('excludes list headers and trailing special rows', () => {
    expect(translateVisibleRange({ first: 0, last: 0 }, 5, 1)).toEqual({
      first: -1,
      last: -1,
    });
    expect(translateVisibleRange({ first: 6, last: 7 }, 5, 1)).toEqual({
      first: -1,
      last: -1,
    });
  });

  it('returns only the visible data intersection', () => {
    expect(translateVisibleRange({ first: 0, last: 2 }, 5, 1)).toEqual({
      first: 0,
      last: 1,
    });
    expect(translateVisibleRange({ first: 4, last: 6 }, 5, 1)).toEqual({
      first: 3,
      last: 4,
    });
  });

  it('returns an empty range for empty data', () => {
    expect(translateVisibleRange({ first: 0, last: 2 }, 0, 1)).toEqual({
      first: -1,
      last: -1,
    });
  });
});
