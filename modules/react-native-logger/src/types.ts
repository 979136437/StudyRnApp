export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogValue = string | number | boolean | null | undefined;
export type LogFields = Readonly<Record<string, LogValue>>;

export interface LoggerOptions {
  enabled?: boolean;
}

export interface Logger {
  debug: (event: string, fields?: LogFields) => void;
  error: (event: string, fields?: LogFields) => void;
  info: (event: string, fields?: LogFields) => void;
  warn: (event: string, fields?: LogFields) => void;
}

export interface QueuedLogEntry {
  createdAt: number;
  elapsedMs: number;
  event: string;
  fields?: LogFields;
  level: LogLevel;
  sequence: number;
}
