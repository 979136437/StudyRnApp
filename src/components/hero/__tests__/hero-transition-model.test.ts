import { describe, expect, it } from 'vitest';

import {
  INITIAL_HERO_TRANSITION_MODEL,
  interpolateHeroRect,
  isHeroGestureEnabled,
  isValidHeroRect,
  returnTransitionMode,
  shouldResetHeroOnRouteUnmount,
  transitionHeroModel,
} from '../hero-transition-model';

describe('Hero 转场状态', () => {
  it('完成进入和返回的完整状态流转', () => {
    const waiting = transitionHeroModel(INITIAL_HERO_TRANSITION_MODEL, {
      id: 'feed-1',
      type: 'begin-enter',
    });
    const entering = transitionHeroModel(waiting, {
      id: 'feed-1',
      type: 'target-ready',
    });
    const shown = transitionHeroModel(entering, {
      id: 'feed-1',
      type: 'enter-finished',
    });
    const returning = transitionHeroModel(shown, {
      id: 'feed-1',
      type: 'begin-return',
    });
    const idle = transitionHeroModel(returning, {
      id: 'feed-1',
      type: 'return-finished',
    });

    expect(waiting.phase).toBe('waiting-target');
    expect(entering.phase).toBe('entering');
    expect(shown.phase).toBe('shown');
    expect(returning.phase).toBe('returning');
    expect(idle).toEqual(INITIAL_HERO_TRANSITION_MODEL);
  });

  it('忽略重复进入和不匹配目标', () => {
    const waiting = transitionHeroModel(INITIAL_HERO_TRANSITION_MODEL, {
      id: 'feed-1',
      type: 'begin-enter',
    });

    expect(
      transitionHeroModel(waiting, {
        id: 'feed-2',
        type: 'begin-enter',
      }),
    ).toBe(waiting);
    expect(
      transitionHeroModel(waiting, {
        id: 'feed-2',
        type: 'target-ready',
      }),
    ).toBe(waiting);
  });

  it('可在目标缺失或减少动态效果时复位', () => {
    const waiting = transitionHeroModel(INITIAL_HERO_TRANSITION_MODEL, {
      id: 'feed-1',
      type: 'begin-enter',
    });

    expect(transitionHeroModel(waiting, { type: 'reset' })).toEqual(
      INITIAL_HERO_TRANSITION_MODEL,
    );
  });
});

describe('Hero 几何计算', () => {
  const source = { height: 100, width: 120, x: 10, y: 20 };
  const target = { height: 240, width: 320, x: 20, y: 80 };

  it('在两个矩形间插值并限制进度范围', () => {
    expect(interpolateHeroRect(source, target, 0.5)).toEqual({
      height: 170,
      width: 220,
      x: 15,
      y: 50,
    });
    expect(interpolateHeroRect(source, target, -1)).toEqual(source);
    expect(interpolateHeroRect(source, target, 2)).toEqual(target);
  });

  it('仅接受可测量的正尺寸矩形', () => {
    expect(isValidHeroRect(source)).toBe(true);
    expect(isValidHeroRect(null)).toBe(false);
    expect(isValidHeroRect({ ...source, width: 0 })).toBe(false);
    expect(isValidHeroRect({ ...source, x: Number.NaN })).toBe(false);
  });

  it('来源被虚拟列表回收时采用淡出降级', () => {
    expect(returnTransitionMode(source)).toBe('move');
    expect(returnTransitionMode(null)).toBe('fade');
  });
});

describe('Hero 页面生命周期', () => {
  it('仅在静止展示或非当前 Hero 页面时允许手势退出', () => {
    expect(isHeroGestureEnabled(INITIAL_HERO_TRANSITION_MODEL, 'feed-1')).toBe(
      true,
    );
    expect(
      isHeroGestureEnabled(
        { activeId: 'feed-1', phase: 'waiting-target' },
        'feed-1',
      ),
    ).toBe(false);
    expect(
      isHeroGestureEnabled({ activeId: 'feed-1', phase: 'shown' }, 'feed-1'),
    ).toBe(true);
    expect(
      isHeroGestureEnabled(
        { activeId: 'feed-1', phase: 'returning' },
        'feed-1',
      ),
    ).toBe(false);
  });

  it('手势退出时清理状态，但保留正在执行的反向动画', () => {
    expect(
      shouldResetHeroOnRouteUnmount(
        { activeId: 'feed-1', phase: 'shown' },
        'feed-1',
      ),
    ).toBe(true);
    expect(
      shouldResetHeroOnRouteUnmount(
        { activeId: 'feed-1', phase: 'returning' },
        'feed-1',
      ),
    ).toBe(false);
    expect(
      shouldResetHeroOnRouteUnmount(
        { activeId: 'feed-2', phase: 'shown' },
        'feed-1',
      ),
    ).toBe(false);
  });
});
