import type { DiagnosticReport, JsonValue } from './types';

export const REDACTED_VALUE = '[已脱敏]';
export const CIRCULAR_VALUE = '[循环引用]';
export const TRUNCATED_VALUE = '[已截断]';

const DEFAULT_MAX_STRING_LENGTH = 2_000;
const DEFAULT_MAX_DEPTH = 6;
const DEFAULT_MAX_ENTRIES = 50;
const MAX_REPORT_BYTES = 512 * 1024;
const MAX_STACK_LENGTH = 32_000;

const SENSITIVE_KEY_PATTERN =
  /^(?:authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|token|access[_-]?token|refresh[_-]?token|id[_-]?token|body|payload|user|email|phone)$/i;

type SanitizeOptions = {
  maxDepth?: number;
  maxEntries?: number;
  maxStringLength?: number;
};

function truncate(value: string, maximum: number): string {
  if (value.length <= maximum) return value;
  return `${value.slice(0, maximum)}${TRUNCATED_VALUE}`;
}

/** 删除 URL 的查询参数和片段，同时保留定位请求所需的主机及路径。 */
export function sanitizeUrl(value: string): string {
  const withoutFragment = value.split('#', 1)[0] ?? '';
  const withoutQuery = withoutFragment.split('?', 1)[0] ?? '';
  return truncate(withoutQuery, DEFAULT_MAX_STRING_LENGTH);
}

function shouldRedact(key: string, path: readonly string[]): boolean {
  if (SENSITIVE_KEY_PATTERN.test(key)) return true;
  const parent = path.at(-1)?.toLowerCase();
  return (
    parent === 'request' && /^(?:data|headers|cookies|query_string)$/i.test(key)
  );
}

/** 将任意运行时值转换为有界、可序列化且默认脱敏的 JSON 数据。 */
export function sanitizeValue(
  value: unknown,
  options: SanitizeOptions = {},
): JsonValue {
  const seen = new WeakSet<object>();
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxStringLength = options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH;

  const visit = (
    current: unknown,
    depth: number,
    path: readonly string[],
  ): JsonValue => {
    if (current === null || typeof current === 'boolean') return current;
    if (typeof current === 'number')
      return Number.isFinite(current) ? current : String(current);
    if (typeof current === 'string') {
      const text = path.at(-1)?.toLowerCase().includes('url')
        ? sanitizeUrl(current)
        : current;
      return truncate(text, maxStringLength);
    }
    if (typeof current === 'bigint') return String(current);
    if (typeof current === 'undefined') return null;
    if (typeof current === 'function' || typeof current === 'symbol')
      return String(current);
    if (current instanceof Date) return current.toISOString();
    if (current instanceof Error) {
      return {
        name: truncate(current.name || 'Error', maxStringLength),
        message: truncate(current.message, maxStringLength),
        stack: truncate(current.stack ?? '', MAX_STACK_LENGTH),
      };
    }
    if (depth >= maxDepth) return TRUNCATED_VALUE;
    if (typeof current !== 'object')
      return truncate(String(current), maxStringLength);
    if (seen.has(current)) return CIRCULAR_VALUE;
    seen.add(current);

    if (Array.isArray(current)) {
      return current
        .slice(0, maxEntries)
        .map((entry, index) =>
          visit(entry, depth + 1, [...path, String(index)]),
        );
    }

    const output: Record<string, JsonValue> = {};
    const entries = Object.entries(current as Record<string, unknown>).slice(
      0,
      maxEntries,
    );
    for (const [key, entry] of entries) {
      output[key] = shouldRedact(key, path)
        ? REDACTED_VALUE
        : visit(entry, depth + 1, [...path, key]);
    }
    return output;
  };

  return visit(value, 0, []);
}

/**
 * 为 Sentry 传输事件递归脱敏，但不限制数组长度和对象深度，避免破坏堆栈帧、线程及
 * 原生调试元数据的结构。
 */
export function redactTransportValue<T>(value: T): T {
  const seen = new WeakSet<object>();
  const visit = (current: unknown, path: readonly string[]): unknown => {
    if (current === null || typeof current !== 'object') {
      if (
        typeof current === 'string' &&
        path.at(-1)?.toLowerCase().includes('url')
      ) {
        return sanitizeUrl(current);
      }
      return current;
    }
    if (seen.has(current)) return CIRCULAR_VALUE;
    seen.add(current);
    if (Array.isArray(current)) {
      return current.map((entry, index) =>
        visit(entry, [...path, String(index)]),
      );
    }
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(
      current as Record<string, unknown>,
    )) {
      output[key] = shouldRedact(key, path)
        ? REDACTED_VALUE
        : visit(entry, [...path, key]);
    }
    return output;
  };
  return visit(value, []) as T;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/** 序列化报告并在超限时优先裁剪最早的 breadcrumb 和大段上下文。 */
export function serializeReport(report: DiagnosticReport): string {
  const bounded: DiagnosticReport = {
    ...report,
    error: {
      ...report.error,
      message: truncate(report.error.message, DEFAULT_MAX_STRING_LENGTH),
      stack:
        report.error.stack === undefined
          ? undefined
          : truncate(report.error.stack, MAX_STACK_LENGTH),
    },
    breadcrumbs: [...report.breadcrumbs],
  };
  let serialized = JSON.stringify(bounded, null, 2);

  while (
    byteLength(serialized) > MAX_REPORT_BYTES &&
    bounded.breadcrumbs.length > 0
  ) {
    const removeCount = Math.max(1, Math.ceil(bounded.breadcrumbs.length / 4));
    bounded.breadcrumbs = bounded.breadcrumbs.slice(removeCount);
    serialized = JSON.stringify(bounded, null, 2);
  }
  if (byteLength(serialized) > MAX_REPORT_BYTES) {
    bounded.contexts = {};
    bounded.error.message = truncate(bounded.error.message, 1_000);
    if (bounded.error.stack !== undefined) {
      bounded.error.stack = truncate(bounded.error.stack, 8_000);
    }
    serialized = JSON.stringify(bounded, null, 2);
  }
  if (byteLength(serialized) > MAX_REPORT_BYTES) {
    bounded.error.stack = undefined;
    serialized = JSON.stringify(bounded, null, 2);
  }
  return serialized;
}
