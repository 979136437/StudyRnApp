import {
  createLoggerRuntime,
  defaultLoggerRuntimeDependencies,
} from '../core/logger-runtime';
import type { Logger, LoggerOptions } from '../types';

export function createLogger(tag: string, options?: LoggerOptions): Logger {
  return createLoggerRuntime(tag, options, defaultLoggerRuntimeDependencies);
}
