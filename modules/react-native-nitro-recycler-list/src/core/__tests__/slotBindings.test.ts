import { describe, expect, it } from 'vitest';

import { areSlotBindingsEqual } from '../slotBindings';

const first = {
  slotId: 1,
  index: 0,
  itemKey: 'article-1',
  itemType: 'article',
};
const second = {
  slotId: 2,
  index: 1,
  itemKey: 'article-2',
  itemType: 'article',
};

describe('areSlotBindingsEqual', () => {
  it('treats equivalent native snapshots as the same state', () => {
    expect(
      areSlotBindingsEqual([first, second], [{ ...first }, { ...second }]),
    ).toBe(true);
  });

  it('detects slot order and item binding changes', () => {
    expect(areSlotBindingsEqual([first, second], [second, first])).toBe(false);
    expect(
      areSlotBindingsEqual([first], [{ ...first, itemKey: 'article-3' }]),
    ).toBe(false);
  });
});
