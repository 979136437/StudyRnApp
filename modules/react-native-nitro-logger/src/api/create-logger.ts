import {
  createLoggerRuntime,
  defaultLoggerRuntimeDependencies,
} from '../core/logger-runtime';
import { enqueueNativeLogs } from '../native/native-logger';
import type { LoggerOptions, NitroLogger } from '../types';

export function createLogger(
  tag: string,
  options?: LoggerOptions,
): NitroLogger {
  return createLoggerRuntime(tag, options, {
    ...defaultLoggerRuntimeDependencies,
    enqueueNative: enqueueNativeLogs,
  });
}
