import { describe, expect, it } from 'vitest';

import { appendBounded } from '../buffer';
import { selectReportsToDelete } from '../retention';
import { isAbnormalPreviousSession } from '../session';
import type { DiagnosticReport, DiagnosticSession } from '../types';

const session: DiagnosticSession = {
  sessionId: 'session-1',
  startedAt: '2026-07-31T00:00:00.000Z',
  lastSeenAt: '2026-07-31T00:05:00.000Z',
  appState: 'active',
  route: '/diagnostics',
  endedCleanly: false,
};

function report(id: string, createdAt: string): DiagnosticReport {
  return {
    schemaVersion: 1,
    id,
    createdAt,
    kind: 'manual',
    fatal: false,
    app: {
      name: 'app',
      applicationId: null,
      version: null,
      buildVersion: null,
    },
    runtime: {
      platform: 'android',
      osVersion: '36',
      deviceModel: null,
      reactNativeVersion: null,
      jsEngine: 'hermes',
      newArchitecture: true,
      route: null,
      appState: 'active',
      sessionId: 'session-1',
    },
    error: { name: 'Error', message: id },
    contexts: {},
    breadcrumbs: [],
  };
}

describe('appendBounded', () => {
  it('keeps only the newest values without mutating the source', () => {
    const source = [1, 2];
    expect(appendBounded(source, 3, 2)).toEqual([2, 3]);
    expect(source).toEqual([1, 2]);
  });
});

describe('isAbnormalPreviousSession', () => {
  it('detects native crashes and unfinished foreground sessions', () => {
    expect(isAbnormalPreviousSession(null, true)).toBe(true);
    expect(isAbnormalPreviousSession(session, false)).toBe(true);
  });

  it('ignores clean or background terminations', () => {
    expect(
      isAbnormalPreviousSession({ ...session, endedCleanly: true }, false),
    ).toBe(false);
    expect(
      isAbnormalPreviousSession({ ...session, appState: 'background' }, false),
    ).toBe(false);
  });
});

describe('selectReportsToDelete', () => {
  it('applies age and count limits using newest-first order', () => {
    const now = Date.parse('2026-07-31T12:00:00.000Z');
    const reports = [
      report('newest', '2026-07-31T11:00:00.000Z'),
      report('middle', '2026-07-31T10:00:00.000Z'),
      report('old', '2026-07-20T10:00:00.000Z'),
    ];
    expect(
      selectReportsToDelete(reports, now, 2, 7 * 24 * 60 * 60_000),
    ).toEqual(['old']);
    expect(
      selectReportsToDelete(reports, now, 1, 30 * 24 * 60 * 60_000),
    ).toEqual(['middle', 'old']);
  });
});
