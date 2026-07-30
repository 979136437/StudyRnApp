import { describe, expect, it } from 'vitest';

import { resolveTabTargetOffset, validateTabKeys } from '../tabState';

describe('tab state', () => {
  it('rejects empty and duplicate tab keys', () => {
    expect(() => validateTabKeys([])).toThrow('至少需要一个');
    expect(() => validateTabKeys([{ key: 'a' }, { key: 'a' }])).toThrow(
      '不能重复',
    );
  });

  it('syncs partial collapse and preserves deeper offsets', () => {
    expect(resolveTabTargetOffset(60, 180, 320)).toBe(60);
    expect(resolveTabTargetOffset(180, 180, 320)).toBe(320);
  });
});
