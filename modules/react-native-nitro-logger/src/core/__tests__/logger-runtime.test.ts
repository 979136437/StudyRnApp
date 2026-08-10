import { describe, expect, it, vi } from 'vitest';

import type { LogLevel, NativeLogEntry } from '../../specs/NativeLogger.nitro';
import {
  createLoggerRuntime,
  type IdleDeadlineLike,
  type LoggerRuntimeDependencies,
} from '../logger-runtime';

function createHarness(nativeAvailable = true) {
  const callbacks: ((deadline: IdleDeadlineLike) => void)[] = [];
  const consoleSink = vi.fn<(level: LogLevel, message: string) => void>();
  const enqueueNative = vi.fn<(entries: NativeLogEntry[]) => boolean>(
    () => nativeAvailable,
  );
  let now = new Date(2026, 7, 10, 16, 42, 1, 0).getTime();
  const dependencies: LoggerRuntimeDependencies = {
    consoleSink,
    enqueueNative,
    now: () => now,
    scheduleIdle: (callback) => callbacks.push(callback),
  };

  return {
    callbacks,
    consoleSink,
    dependencies,
    enqueueNative,
    passTime: (milliseconds: number) => {
      now += milliseconds;
    },
    runIdle: (remaining = Number.POSITIVE_INFINITY) => {
      const callback = callbacks.shift();
      callback?.({ timeRemaining: () => remaining });
    },
  };
}

describe('非阻塞日志运行时', () => {
  it('调用阶段只入队，空闲阶段才输出两个通道', () => {
    const harness = createHarness();
    const logger = createLoggerRuntime(
      'InteractiveList',
      {},
      harness.dependencies,
    );

    logger.info('drag.start', { session: 1 });
    expect(harness.consoleSink).not.toHaveBeenCalled();
    expect(harness.enqueueNative).not.toHaveBeenCalled();
    expect(harness.callbacks).toHaveLength(1);

    harness.runIdle();
    expect(harness.consoleSink).toHaveBeenCalledOnce();
    expect(harness.enqueueNative).toHaveBeenCalledOnce();
    expect(harness.enqueueNative.mock.calls[0][0]).toHaveLength(1);
  });

  it('每个空闲批次最多处理五十条并保持顺序', () => {
    const harness = createHarness();
    const logger = createLoggerRuntime('List', {}, harness.dependencies);
    for (let index = 1; index <= 60; index += 1) {
      logger.debug('move', { index });
    }

    harness.runIdle();
    expect(harness.enqueueNative.mock.calls[0][0]).toHaveLength(50);
    expect(harness.callbacks).toHaveLength(1);
    harness.runIdle();
    expect(harness.enqueueNative.mock.calls[1][0]).toHaveLength(10);
    expect(harness.enqueueNative.mock.calls[1][0][9].message).toContain(
      'index=60',
    );
  });

  it('队列溢出时丢弃最旧日志并报告数量', () => {
    const harness = createHarness();
    const logger = createLoggerRuntime('List', {}, harness.dependencies);
    for (let index = 1; index <= 502; index += 1) {
      logger.debug('move', { index });
    }

    harness.runIdle();
    const firstBatch = harness.enqueueNative.mock.calls[0][0];
    expect(firstBatch).toHaveLength(50);
    expect(firstBatch[0].message).toContain('logger.dropped count=3');
    expect(firstBatch[1].message).toContain('index=4');
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

  it('原生通道不可用时只报告一次并继续输出 JavaScript', () => {
    const harness = createHarness(false);
    const logger = createLoggerRuntime('List', {}, harness.dependencies);
    logger.warn('first');
    harness.runIdle();
    logger.warn('second');
    harness.runIdle();

    expect(harness.consoleSink).toHaveBeenCalledTimes(3);
    expect(harness.consoleSink.mock.calls[1][1]).toContain(
      'native.unavailable',
    );
  });
});
