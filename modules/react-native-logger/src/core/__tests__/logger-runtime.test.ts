import { describe, expect, it, vi } from 'vitest';

import type { LogLevel } from '../../types';
import {
  createLoggerRuntime,
  type IdleDeadlineLike,
  type LoggerRuntimeDependencies,
} from '../logger-runtime';

function createHarness() {
  const callbacks: ((deadline: IdleDeadlineLike) => void)[] = [];
  const consoleSink = vi.fn<(level: LogLevel, message: string) => void>();
  let now = new Date(2026, 7, 10, 16, 42, 1, 0).getTime();
  const dependencies: LoggerRuntimeDependencies = {
    consoleSink,
    now: () => now,
    scheduleIdle: (callback) => callbacks.push(callback),
  };

  return {
    callbacks,
    consoleSink,
    dependencies,
    passTime: (milliseconds: number) => {
      now += milliseconds;
    },
    runIdle: (
      remaining: number | (() => number) = Number.POSITIVE_INFINITY,
    ) => {
      const callback = callbacks.shift();
      callback?.({
        timeRemaining:
          typeof remaining === 'function' ? remaining : () => remaining,
      });
    },
  };
}

describe('非阻塞日志运行时', () => {
  it('调用阶段只入队，空闲阶段才输出日志', () => {
    const harness = createHarness();
    const logger = createLoggerRuntime('Example', {}, harness.dependencies);

    logger.info('drag.start', { session: 1 });
    expect(harness.consoleSink).not.toHaveBeenCalled();
    expect(harness.callbacks).toHaveLength(1);

    harness.runIdle();
    expect(harness.consoleSink).toHaveBeenCalledOnce();
  });

  it('每个空闲批次只处理一条并保持顺序', () => {
    const harness = createHarness();
    const logger = createLoggerRuntime('List', {}, harness.dependencies);
    for (let index = 1; index <= 60; index += 1) {
      logger.debug('move', { index });
    }

    harness.runIdle();
    expect(harness.consoleSink).toHaveBeenCalledOnce();
    expect(harness.callbacks).toHaveLength(1);
    while (harness.callbacks.length > 0) {
      harness.runIdle();
    }
    expect(harness.consoleSink).toHaveBeenCalledTimes(60);
    expect(harness.consoleSink.mock.calls[59][1]).toContain('index=60');
  });

  it('输出后仍有日志时重新调度空闲任务', () => {
    const harness = createHarness();
    const logger = createLoggerRuntime('List', {}, harness.dependencies);
    logger.debug('move', { index: 1 });
    logger.debug('move', { index: 2 });
    logger.debug('move', { index: 3 });

    harness.runIdle();

    expect(harness.consoleSink).toHaveBeenCalledOnce();
    expect(harness.callbacks).toHaveLength(1);
  });

  it('队列溢出时丢弃最旧日志并报告数量', () => {
    const harness = createHarness();
    const logger = createLoggerRuntime('List', {}, harness.dependencies);
    for (let index = 1; index <= 502; index += 1) {
      logger.debug('move', { index });
    }

    harness.runIdle();
    expect(harness.consoleSink).toHaveBeenCalledOnce();
    expect(harness.consoleSink.mock.calls[0][1]).toContain(
      'logger.dropped count=3',
    );
    harness.runIdle();
    expect(harness.consoleSink.mock.calls[1][1]).toContain('index=4');
  });

  it('禁用时不分配调度任务', () => {
    const harness = createHarness();
    const logger = createLoggerRuntime(
      'List',
      { enabled: false },
      harness.dependencies,
    );
    logger.error('ignored', { value: 1 });

    expect(harness.callbacks).toHaveLength(0);
    expect(harness.consoleSink).not.toHaveBeenCalled();
  });
});
