import { describe, expect, it } from 'vitest';

import {
  buildItemLayouts,
  findReorderTarget,
  findReorderTargetWithHysteresis,
  getAutoScrollSpeed,
  getExchangeAnimationIndex,
  getReorderOffsets,
  haveSameKeyOrder,
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

  it('在相邻项目中心附近保持当前目标', () => {
    expect(findReorderTargetWithHysteresis(layouts, 0, 1, 169, 10)).toBe(1);
    expect(findReorderTargetWithHysteresis(layouts, 0, 1, 171, 10)).toBe(2);
    expect(findReorderTargetWithHysteresis(layouts, 0, 2, 151, 10)).toBe(2);
    expect(findReorderTargetWithHysteresis(layouts, 0, 2, 139, 10)).toBe(1);
  });

  it('快速移动时可以连续跨过多个动态高度项目', () => {
    expect(findReorderTargetWithHysteresis(layouts, 0, 0, 250, 8)).toBe(3);
    expect(findReorderTargetWithHysteresis(layouts, 3, 3, 10, 8)).toBe(0);
  });

  it('换位后被动项目只留出一个等高占位', () => {
    const translations = getReorderOffsets(layouts, 0, 2);
    const passivePositions = layouts
      .map((layout, index) => ({
        end: layout.offset + translations[index] + layout.length,
        index,
        start: layout.offset + translations[index],
      }))
      .filter(({ index }) => index !== 0)
      .sort((left, right) => left.start - right.start);

    expect(passivePositions).toEqual([
      { end: 80, index: 1, start: 0 },
      { end: 140, index: 2, start: 80 },
      { end: 280, index: 3, start: 190 },
    ]);
    expect(passivePositions[2].start - passivePositions[1].end).toBe(50);
  });

  it('向上换位时同样保持被动项目连续排列', () => {
    const translations = getReorderOffsets(layouts, 3, 1);
    const passivePositions = layouts
      .map((layout, index) => ({
        end: layout.offset + translations[index] + layout.length,
        index,
        start: layout.offset + translations[index],
      }))
      .filter(({ index }) => index !== 3)
      .sort((left, right) => left.start - right.start);

    expect(passivePositions).toEqual([
      { end: 50, index: 0, start: 0 },
      { end: 220, index: 1, start: 140 },
      { end: 280, index: 2, start: 220 },
    ]);
    expect(passivePositions[1].start - passivePositions[0].end).toBe(90);
  });

  it('每轮交换只动画最靠近占位边界的项目', () => {
    expect(getExchangeAnimationIndex(0, 0, 1)).toBe(1);
    expect(getExchangeAnimationIndex(0, 2, 3)).toBe(3);
    expect(getExchangeAnimationIndex(0, 3, 2)).toBe(3);
    expect(getExchangeAnimationIndex(3, 3, 2)).toBe(2);
    expect(getExchangeAnimationIndex(3, 1, 0)).toBe(0);
    expect(getExchangeAnimationIndex(3, 0, 1)).toBe(0);
  });

  it('跨过活动位置时从新方向的边界开始交换', () => {
    expect(getExchangeAnimationIndex(2, 0, 4)).toBe(4);
    expect(getExchangeAnimationIndex(2, 4, 0)).toBe(0);
    expect(getExchangeAnimationIndex(2, 1, 2)).toBe(1);
    expect(getExchangeAnimationIndex(2, 2, 3)).toBe(3);
    expect(getExchangeAnimationIndex(2, 2, 2)).toBeUndefined();
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

  it('只在 key 数量和顺序都一致时视为同一数据结构', () => {
    expect(haveSameKeyOrder(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(haveSameKeyOrder(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(haveSameKeyOrder(['a'], ['a', 'b'])).toBe(false);
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
