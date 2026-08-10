import { describe, expect, it } from 'vitest';

import {
  buildItemLayouts,
  findReorderTarget,
  getAutoScrollSpeed,
  getReorderOffsets,
  reorderItems,
} from '../interactive-list-layout';

describe('交互列表布局', () => {
  const keys = ['a', 'b', 'c', 'd'];
  const lengths = new Map([
    ['a', 50],
    ['b', 80],
    ['c', 60],
    ['d', 90],
  ]);
  const layouts = buildItemLayouts(keys, lengths, 72);

  it('按动态高度累积每一项的位置', () => {
    expect(layouts).toEqual([
      { index: 0, length: 50, offset: 0 },
      { index: 1, length: 80, offset: 50 },
      { index: 2, length: 60, offset: 130 },
      { index: 3, length: 90, offset: 190 },
    ]);
  });

  it('未测量项目使用估算高度', () => {
    expect(buildItemLayouts(['a', 'missing'], lengths, 72)[1]).toEqual({
      index: 1,
      length: 72,
      offset: 50,
    });
  });

  it('越过相邻项目中心后更新目标位置', () => {
    expect(findReorderTarget(layouts, 0, 91)).toBe(1);
    expect(findReorderTarget(layouts, 0, 161)).toBe(2);
    expect(findReorderTarget(layouts, 3, 80)).toBe(1);
  });

  it('为被跨越项目生成交换位移', () => {
    expect(getReorderOffsets(layouts, 0, 2)).toEqual([140, -50, -50, 0]);
    expect(getReorderOffsets(layouts, 3, 1)).toEqual([0, 90, 90, -140]);
  });

  it('重排时不修改原数组', () => {
    const source = ['a', 'b', 'c'];
    expect(reorderItems(source, 0, 2)).toEqual(['b', 'c', 'a']);
    expect(source).toEqual(['a', 'b', 'c']);
  });

  it('无效位置返回独立副本', () => {
    const source = ['a', 'b'];
    const result = reorderItems(source, -1, 1);
    expect(result).toEqual(source);
    expect(result).not.toBe(source);
  });

  it('只在视口边缘生成有上限的滚动速度', () => {
    const common = {
      edgeSize: 80,
      maxSpeed: 16,
      viewportEnd: 600,
      viewportStart: 100,
    };
    expect(getAutoScrollSpeed({ ...common, pointerY: 140 })).toBe(-8);
    expect(getAutoScrollSpeed({ ...common, pointerY: 560 })).toBe(8);
    expect(getAutoScrollSpeed({ ...common, pointerY: 350 })).toBe(0);
    expect(getAutoScrollSpeed({ ...common, pointerY: 0 })).toBe(-16);
  });
});
