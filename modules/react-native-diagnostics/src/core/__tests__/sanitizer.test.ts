import { describe, expect, it } from 'vitest';

import {
  CIRCULAR_VALUE,
  redactTransportValue,
  REDACTED_VALUE,
  sanitizeUrl,
  sanitizeValue,
  serializeReport,
  TRUNCATED_VALUE,
} from '../sanitizer';
import type { DiagnosticReport } from '../../types';

function createReport(): DiagnosticReport {
  return {
    schemaVersion: 1,
    id: 'report-1',
    createdAt: '2026-07-31T00:00:00.000Z',
    kind: 'javascript',
    fatal: true,
    app: {
      name: 'my-app',
      applicationId: 'com.study.myapp',
      version: '1.0.0',
      buildVersion: '1',
    },
    runtime: {
      platform: 'ios',
      osVersion: '26',
      deviceModel: 'iPhone',
      reactNativeVersion: '0.86.2',
      jsEngine: 'hermes',
      newArchitecture: true,
      route: '/diagnostics',
      appState: 'active',
      sessionId: 'session-1',
    },
    error: { name: 'Error', message: 'boom', stack: 'stack' },
    contexts: {},
    breadcrumbs: [],
  };
}

describe('sanitizeValue', () => {
  it('redacts secrets, request data and user values recursively', () => {
    const result = sanitizeValue({
      token: 'token-value',
      request: {
        data: { title: 'private' },
        headers: { Authorization: 'Bearer value' },
        url: 'https://api.test/items?phone=123#section',
      },
      nested: { password: 'password-value' },
      user: { email: 'private@example.com' },
    });

    expect(result).toMatchObject({
      token: REDACTED_VALUE,
      request: {
        data: REDACTED_VALUE,
        headers: REDACTED_VALUE,
        url: 'https://api.test/items',
      },
      nested: { password: REDACTED_VALUE },
      user: REDACTED_VALUE,
    });
  });

  it('handles cyclic objects and depth limits', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(sanitizeValue(cyclic)).toEqual({ self: CIRCULAR_VALUE });
    expect(sanitizeValue({ one: { two: 2 } }, { maxDepth: 1 })).toEqual({
      one: TRUNCATED_VALUE,
    });
  });

  it('limits strings and collection entries', () => {
    expect(sanitizeValue('abcdef', { maxStringLength: 3 })).toBe(
      `abc${TRUNCATED_VALUE}`,
    );
    expect(sanitizeValue([1, 2, 3], { maxEntries: 2 })).toEqual([1, 2]);
  });
});

describe('sanitizeUrl', () => {
  it('removes query parameters and fragments from relative and absolute URLs', () => {
    expect(sanitizeUrl('/items?page=2#top')).toBe('/items');
    expect(sanitizeUrl('https://api.test/items?token=value')).toBe(
      'https://api.test/items',
    );
  });
});

describe('redactTransportValue', () => {
  it('preserves complete stack frame arrays while removing request secrets', () => {
    const frames = Array.from({ length: 80 }, (_, index) => ({
      filename: `file-${index}.tsx`,
      lineno: index,
    }));
    const event = redactTransportValue({
      exception: { values: [{ stacktrace: { frames } }] },
      request: {
        headers: { Authorization: 'Bearer secret' },
        url: 'https://api.test/items?token=secret',
      },
    });
    expect(event.exception.values[0]?.stacktrace.frames).toHaveLength(80);
    expect(event.request).toEqual({
      headers: REDACTED_VALUE,
      url: 'https://api.test/items',
    });
  });
});

describe('serializeReport', () => {
  it('keeps generated reports below 512 KB', () => {
    const report = createReport();
    report.contexts = { oversized: 'x'.repeat(700_000) };
    report.breadcrumbs = Array.from({ length: 200 }, (_, index) => ({
      timestamp: '2026-07-31T00:00:00.000Z',
      category: 'large',
      message: `breadcrumb-${index}`,
      level: 'info',
      data: { value: 'x'.repeat(20_000) },
    }));
    expect(
      new TextEncoder().encode(serializeReport(report)).byteLength,
    ).toBeLessThanOrEqual(512 * 1024);
  });
});
