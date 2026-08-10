import { describe, expect, it } from 'vitest';

import { reconcileOrderedItems } from '../reconcile-items';

describe('picker item reconciliation', () => {
  it('keeps the existing array and item references for identical results', () => {
    const current = [{ id: 'a', title: '最近项目' }];
    const reconciled = reconcileOrderedItems(
      current,
      [{ id: 'a', title: '最近项目' }],
      (item) => item.id,
    );
    expect(reconciled).toBe(current);
    expect(reconciled[0]).toBe(current[0]);
  });

  it('only replaces changed items and preserves incoming order', () => {
    const current = [
      { id: 'a', count: 1 },
      { id: 'b', count: 2 },
    ];
    const reconciled = reconcileOrderedItems(
      current,
      [
        { id: 'b', count: 3 },
        { id: 'a', count: 1 },
      ],
      (item) => item.id,
    );
    expect(reconciled.map((item) => item.id)).toEqual(['b', 'a']);
    expect(reconciled[1]).toBe(current[0]);
    expect(reconciled[0]).not.toBe(current[1]);
  });
});
