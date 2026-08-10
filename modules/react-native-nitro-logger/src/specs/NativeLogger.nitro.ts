import type { HybridObject } from 'react-native-nitro-modules';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface NativeLogEntry {
  level: LogLevel;
  message: string;
  tag: string;
}

export interface NativeLogger extends HybridObject<{
  ios: 'swift';
  android: 'kotlin';
}> {
  /** 仅转交已经格式化的批次，实际系统日志写入由原生后台队列完成。 */
  enqueue(entries: NativeLogEntry[]): void;
}
