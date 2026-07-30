import { describe, expect, it } from 'vitest';

import { createDescriptors, normalizeListOptions } from '../descriptors';

describe('createDescriptors', () => {
  it('creates stable typed descriptors', () => {
    const descriptors = createDescriptors({
      data: [
        { id: 'a', type: 'photo' },
        { id: 'b', type: 'text' },
      ],
      keyExtractor: (item) => item.id,
      getItemType: (item) => item.type,
      getItemSpan: (_, index) => index + 1,
      getStickyLevel: (_, index) => (index === 1 ? 0 : undefined),
      getStickyGroup: (_, index) => (index === 1 ? 'featured' : undefined),
      estimatedItemSize: 120,
      layout: 'grid',
      numColumns: 2,
    });

    expect(descriptors).toEqual([
      {
        key: 'a',
        type: 'photo',
        span: 1,
        stickyLevel: -1,
        stickyGroup: '',
        estimatedSize: 120,
      },
      {
        key: 'b',
        type: 'text',
        span: 2,
        stickyLevel: 0,
        stickyGroup: 'featured',
        estimatedSize: 120,
      },
    ]);
  });

  it('uses a default group for sticky items only', () => {
    const descriptors = createDescriptors({
      data: ['header', 'item'],
      keyExtractor: (item) => item,
      getStickyLevel: (_, index) => (index === 0 ? 1 : undefined),
      estimatedItemSize: 80,
      layout: 'list',
      numColumns: 1,
    });

    expect(descriptors.map((item) => item.stickyGroup)).toEqual([
      '__default__',
      '',
    ]);
  });

  it('rejects duplicate keys', () => {
    expect(() =>
      createDescriptors({
        data: ['a', 'a'],
        keyExtractor: (item) => item,
        estimatedItemSize: 100,
        layout: 'list',
        numColumns: 1,
      }),
    ).toThrow('重复键');
  });

  it('requires sticky grid items to be full span', () => {
    expect(() =>
      createDescriptors({
        data: ['header'],
        keyExtractor: (item) => item,
        getStickyLevel: () => 0,
        estimatedItemSize: 100,
        layout: 'grid',
        numColumns: 2,
      }),
    ).toThrow('必须占满所有列');
  });
});

describe('normalizeListOptions', () => {
  it('normalizes defaults', () => {
    expect(normalizeListOptions({})).toEqual({
      layout: 'list',
      horizontal: false,
      numColumns: 1,
      estimatedItemSize: 100,
      overscan: 1,
    });
  });

  it('rejects horizontal masonry', () => {
    expect(() =>
      normalizeListOptions({ horizontal: true, layout: 'masonry' }),
    ).toThrow('横向模式');
  });
});
