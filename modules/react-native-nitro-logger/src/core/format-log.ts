import type { NativeLogEntry } from '../specs/NativeLogger.nitro';
import type { LogValue, QueuedLogEntry } from '../types';

const LEVEL_LABELS = {
  debug: 'D',
  error: 'E',
  info: 'I',
  warn: 'W',
} as const;

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

function formatValue(value: LogValue): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? String(Math.round(value * 1000) / 1000)
      : JSON.stringify(String(value));
  }
  if (typeof value === 'string') {
    return /\s/.test(value) ? JSON.stringify(value) : value;
  }
  return String(value);
}

export function normalizeLogToken(value: string, fallback: string): string {
  const normalized = value.replace(/[\r\n]+/g, ' ').trim();
  return normalized || fallback;
}

export function formatLogPayload(entry: QueuedLogEntry): string {
  const details = entry.fields
    ? Object.keys(entry.fields)
        .sort()
        .flatMap((key) => {
          const value = formatValue(entry.fields?.[key]);
          return value === undefined ? [] : [`${key}=${value}`];
        })
    : [];
  const suffix = details.length > 0 ? ` ${details.join(' ')}` : '';
  return `#${pad(entry.sequence, 4)} +${Math.max(0, Math.round(entry.elapsedMs))}ms ${normalizeLogToken(entry.event, 'log')}${suffix}`;
}

export function formatJavaScriptLog(
  tag: string,
  entry: QueuedLogEntry,
): string {
  const date = new Date(entry.createdAt);
  const timestamp = `${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)} ${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}:${pad(date.getSeconds(), 2)}.${pad(date.getMilliseconds(), 3)}`;
  return `${timestamp} ${LEVEL_LABELS[entry.level]}/${tag}: ${formatLogPayload(entry)}`;
}

export function toNativeLogEntry(
  tag: string,
  entry: QueuedLogEntry,
): NativeLogEntry {
  return { level: entry.level, message: formatLogPayload(entry), tag };
}
