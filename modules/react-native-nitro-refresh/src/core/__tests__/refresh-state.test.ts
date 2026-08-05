import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_REFRESH_HEADER_HEIGHT } from '../../constants';
import { RefreshState } from '../../types';
import {
  ControlledRefreshCoordinator,
  isMaxStageEnabled,
  RefreshStateCoordinator,
  reduceRefreshState,
  resolveControlledRefreshing,
  resolveRefreshHeaderHeight,
  resolveRefreshMaxDistance,
} from '../refresh-state';

describe('reduceRefreshState', () => {
  it('不足阈值松手与取消拖动始终保持 Idle', () => {
    expect(reduceRefreshState(RefreshState.Idle, 'pulling')).toBe(
      RefreshState.Idle,
    );
    expect(reduceRefreshState(RefreshState.Idle, 'settling')).toBe(
      RefreshState.Idle,
    );
    expect(reduceRefreshState(RefreshState.Idle, 'idle')).toBe(
      RefreshState.Idle,
    );
  });

  it('达到阈值后依次进入 Pulling、Refreshing、End、Idle', () => {
    const phases = ['ready', 'refreshing', 'settling', 'idle'] as const;
    const states = phases.reduce<RefreshState[]>((result, phase) => {
      result.push(
        reduceRefreshState(result.at(-1) ?? RefreshState.Idle, phase),
      );
      return result;
    }, []);

    expect(states).toEqual([
      RefreshState.Pulling,
      RefreshState.Refreshing,
      RefreshState.End,
      RefreshState.Idle,
    ]);
  });

  it('晚到的 ready 通知不会覆盖由位移事件派生的 Max', () => {
    expect(reduceRefreshState(RefreshState.Max, 'ready')).toBe(
      RefreshState.Max,
    );
  });
});

describe('RefreshStateCoordinator', () => {
  it('对内部重复阶段和映射后的相同公共状态去重', () => {
    const onPulling = vi.fn();
    const onRefreshing = vi.fn();
    const onEnd = vi.fn();
    const onIdle = vi.fn();
    const coordinator = new RefreshStateCoordinator({
      onEnd,
      onIdle,
      onPulling,
      onRefreshing,
    });

    for (const phase of [
      'pulling',
      'pulling',
      'ready',
      'ready',
      'refreshing',
      'refreshing',
      'settling',
      'settling',
      'idle',
      'idle',
    ] as const) {
      coordinator.accept(phase);
    }

    expect(onPulling).toHaveBeenCalledOnce();
    expect(onRefreshing).toHaveBeenCalledOnce();
    expect(onEnd).toHaveBeenCalledOnce();
    expect(onIdle).toHaveBeenCalledOnce();
  });

  it('更新回调后使用最新函数而不是旧闭包', () => {
    const staleCallback = vi.fn();
    const currentCallback = vi.fn();
    const coordinator = new RefreshStateCoordinator({
      onPulling: staleCallback,
    });
    coordinator.updateCallbacks({ onPulling: currentCallback });
    coordinator.accept('ready');

    expect(staleCallback).not.toHaveBeenCalled();
    expect(currentCallback).toHaveBeenCalledWith(RefreshState.Pulling);
  });

  it('Max 状态在跨越二级阈值时去重，并允许回拉后再次进入', () => {
    const onMax = vi.fn();
    const onPulling = vi.fn();
    const coordinator = new RefreshStateCoordinator({ onMax, onPulling });

    coordinator.accept('ready');
    coordinator.acceptState(RefreshState.Max);
    coordinator.acceptState(RefreshState.Max);
    coordinator.acceptState(RefreshState.Pulling);
    coordinator.acceptState(RefreshState.Max);

    expect(onMax).toHaveBeenCalledTimes(2);
    expect(onMax).toHaveBeenLastCalledWith(RefreshState.Max);
    expect(onPulling).toHaveBeenCalledTimes(2);
  });
});

describe('ControlledRefreshCoordinator', () => {
  it('支持程序化开始、结束，并忽略重复属性更新', () => {
    const coordinator = new ControlledRefreshCoordinator();

    expect(coordinator.next(true, false)).toBe(false);
    expect(coordinator.next(true, false)).toBeUndefined();
    expect(coordinator.next(true, true)).toBe(true);
    expect(coordinator.next(true, true)).toBeUndefined();
    expect(coordinator.next(true, false)).toBe(false);
  });

  it('用户松手后可强制核对未变化的受控值', () => {
    const coordinator = new ControlledRefreshCoordinator();
    expect(coordinator.next(true, false)).toBe(false);
    expect(coordinator.next(true, false, true)).toBe(false);
  });

  it('禁用逻辑优先于 refreshing', () => {
    expect(resolveControlledRefreshing(false, true)).toBe(false);
    expect(resolveControlledRefreshing(true, true)).toBe(true);
  });
});

describe('resolveRefreshHeaderHeight', () => {
  it('接受大于零的固定有限数值', () => {
    expect(resolveRefreshHeaderHeight(96)).toBe(96);
  });

  it.each([undefined, '80%', 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    '非法高度 %s 警告并回退到默认值',
    (height) => {
      const warn = vi.fn();
      expect(resolveRefreshHeaderHeight(height, warn)).toBe(
        DEFAULT_REFRESH_HEADER_HEIGHT,
      );
      expect(warn).toHaveBeenCalledOnce();
    },
  );
});

describe('resolveRefreshMaxDistance', () => {
  it('未配置时默认与刷新阈值一致', () => {
    expect(resolveRefreshMaxDistance(undefined, 80)).toBe(80);
  });

  it('接受大于或等于刷新阈值的有限数值', () => {
    expect(resolveRefreshMaxDistance(80, 80)).toBe(80);
    expect(resolveRefreshMaxDistance(160, 80)).toBe(160);
  });

  it.each([0, 79, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    '非法最大距离 %s 警告并回退到刷新阈值',
    (maxDistance) => {
      const warn = vi.fn();
      expect(resolveRefreshMaxDistance(maxDistance, 80, warn)).toBe(80);
      expect(warn).toHaveBeenCalledOnce();
    },
  );
});

describe('isMaxStageEnabled', () => {
  it('未传最大距离时不启用 Max，因此不会进入 onMax 回调链路', () => {
    expect(isMaxStageEnabled(undefined, 80)).toBe(false);
  });

  it.each([80, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    '最大距离 %s 不大于有效阈值时不启用 Max',
    (maxDistance) => {
      expect(isMaxStageEnabled(maxDistance, 80)).toBe(false);
    },
  );

  it('仅显式传入大于第一阈值的有限数值时启用 Max', () => {
    expect(isMaxStageEnabled(160, 80)).toBe(true);
  });
});
