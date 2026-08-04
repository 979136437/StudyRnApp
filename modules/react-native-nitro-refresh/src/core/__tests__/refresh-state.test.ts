import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_REFRESH_HEADER_HEIGHT } from '../../constants';
import { RefreshState } from '../../types';
import {
  ControlledRefreshCoordinator,
  RefreshStateCoordinator,
  reduceRefreshState,
  resolveControlledRefreshing,
  resolveRefreshHeaderHeight,
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

  it('成功和失败内部结果阶段都折叠为 End', () => {
    expect(reduceRefreshState(RefreshState.Refreshing, 'success')).toBe(
      RefreshState.End,
    );
    expect(reduceRefreshState(RefreshState.Refreshing, 'failure')).toBe(
      RefreshState.End,
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
      'success',
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
