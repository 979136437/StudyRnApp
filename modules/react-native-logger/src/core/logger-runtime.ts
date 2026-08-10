import type {
  Logger,
  LogFields,
  LogLevel,
  LoggerOptions,
  QueuedLogEntry,
} from '../types';
import { formatJavaScriptLog, normalizeLogToken } from './format-log';

const IDLE_TIMEOUT_MS = 500;
const MAX_BATCH_SIZE = 50;
const MAX_QUEUE_SIZE = 500;
const MIN_IDLE_TIME_MS = 2;

export interface IdleDeadlineLike {
  timeRemaining: () => number;
}

export interface LoggerRuntimeDependencies {
  consoleSink: (level: LogLevel, message: string) => void;
  now: () => number;
  scheduleIdle: (callback: (deadline: IdleDeadlineLike) => void) => void;
}

interface MutableDroppedEntry extends QueuedLogEntry {
  fields: { count: number };
}

function defaultConsoleSink(level: LogLevel, message: string): void {
  const method = console[level];
  method(message);
}

function defaultScheduleIdle(
  callback: (deadline: IdleDeadlineLike) => void,
): void {
  const runtime = globalThis as typeof globalThis & {
    requestIdleCallback?: (
      idleCallback: (deadline: IdleDeadlineLike) => void,
      options?: { timeout: number },
    ) => number;
  };
  if (runtime.requestIdleCallback) {
    runtime.requestIdleCallback(callback, { timeout: IDLE_TIMEOUT_MS });
    return;
  }
  setTimeout(
    () => callback({ timeRemaining: () => Number.POSITIVE_INFINITY }),
    0,
  );
}

export function createLoggerRuntime(
  rawTag: string,
  options: LoggerOptions = {},
  dependencies: LoggerRuntimeDependencies,
): Logger {
  const enabled = options.enabled ?? true;
  const tag = normalizeLogToken(rawTag, 'App');
  const queue: QueuedLogEntry[] = [];
  const startedAt = dependencies.now();
  let droppedEntry: MutableDroppedEntry | undefined;
  let scheduled = false;
  let sequence = 0;

  const schedule = (): void => {
    if (scheduled || queue.length === 0) {
      return;
    }
    scheduled = true;
    dependencies.scheduleIdle(drain);
  };

  const drain = (deadline: IdleDeadlineLike): void => {
    scheduled = false;
    const batch: QueuedLogEntry[] = [];
    while (
      queue.length > 0 &&
      batch.length < MAX_BATCH_SIZE &&
      (batch.length === 0 || deadline.timeRemaining() >= MIN_IDLE_TIME_MS)
    ) {
      const entry = queue.shift();
      if (entry) {
        batch.push(entry);
      }
    }

    if (batch.length > 0) {
      batch.forEach((entry) =>
        dependencies.consoleSink(entry.level, formatJavaScriptLog(tag, entry)),
      );
    }
    if (queue.length > 0) {
      schedule();
    } else {
      droppedEntry = undefined;
    }
  };

  const enqueue = (
    level: LogLevel,
    event: string,
    fields?: LogFields,
  ): void => {
    if (!enabled) {
      return;
    }
    const now = dependencies.now();
    const entry: QueuedLogEntry = {
      createdAt: now,
      elapsedMs: now - startedAt,
      event,
      fields: fields ? { ...fields } : undefined,
      level,
      sequence: ++sequence,
    };

    if (queue.length >= MAX_QUEUE_SIZE) {
      if (droppedEntry && queue[0] === droppedEntry) {
        queue.splice(1, 1);
        droppedEntry.fields.count += 1;
      } else {
        const firstDropped = queue.shift();
        queue.shift();
        droppedEntry = {
          createdAt: now,
          elapsedMs: now - startedAt,
          event: 'logger.dropped',
          fields: { count: 2 },
          level: 'warn',
          sequence: firstDropped?.sequence ?? entry.sequence,
        };
        queue.unshift(droppedEntry);
      }
    }
    queue.push(entry);
    schedule();
  };

  return {
    debug: (event, fields) => enqueue('debug', event, fields),
    error: (event, fields) => enqueue('error', event, fields),
    info: (event, fields) => enqueue('info', event, fields),
    warn: (event, fields) => enqueue('warn', event, fields),
  };
}

export const defaultLoggerRuntimeDependencies: LoggerRuntimeDependencies = {
  consoleSink: defaultConsoleSink,
  now: Date.now,
  scheduleIdle: defaultScheduleIdle,
};
