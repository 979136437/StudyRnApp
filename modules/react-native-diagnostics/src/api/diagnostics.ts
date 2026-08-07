import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

import { appendBounded } from '../core/buffer';
import { sanitizeValue, sanitizeUrl } from '../core/sanitizer';
import { isAbnormalPreviousSession } from '../core/session';
import {
  getReport,
  listReports,
  pruneReports,
  readSession,
  updateReport,
  writeReport,
  writeSession,
} from '../native/report-storage';
import type {
  DiagnosticBreadcrumb,
  DiagnosticError,
  DiagnosticKind,
  DiagnosticLevel,
  DiagnosticReport,
  DiagnosticSession,
  JsonValue,
} from '../types';

const MAX_BREADCRUMBS = 200;
const breadcrumbs: DiagnosticBreadcrumb[] = [];
const contexts: Record<string, JsonValue> = {};
let currentRoute: string | null = null;
let currentAppState: string = AppState.currentState;
let currentSession: DiagnosticSession | null = null;
let lastRecorded:
  | { fingerprint: string; recordedAt: number; reportId: string }
  | undefined;

function createId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 12);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function readDeviceModel(): string | null {
  const constants = Platform.constants as Record<string, unknown>;
  const value = constants.Model ?? constants.model ?? constants.interfaceIdiom;
  return typeof value === 'string' ? value : null;
}

function readReactNativeVersion(): string | null {
  const constants = Platform.constants as Record<string, unknown>;
  const version = constants.reactNativeVersion;
  if (version === null || typeof version !== 'object') return null;
  const parts = version as Record<string, unknown>;
  return [parts.major, parts.minor, parts.patch]
    .filter((part) => typeof part === 'number')
    .join('.');
}

function readJsEngine(): 'hermes' | 'jsc' | 'unknown' {
  const runtime = globalThis as typeof globalThis & {
    HermesInternal?: unknown;
  };
  if (runtime.HermesInternal !== undefined) return 'hermes';
  return Platform.OS === 'web' ? 'unknown' : 'jsc';
}

function isNewArchitecture(): boolean {
  const runtime = globalThis as typeof globalThis & {
    nativeFabricUIManager?: unknown;
  };
  return runtime.nativeFabricUIManager !== undefined;
}

function normalizeError(error: unknown): DiagnosticError {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || String(error),
      stack: error.stack,
    };
  }
  if (typeof error === 'string') return { name: 'Error', message: error };
  return {
    name: 'UnknownError',
    message: JSON.stringify(sanitizeValue(error)),
  };
}

function createReport(
  error: DiagnosticError,
  options: {
    fatal: boolean;
    kind: DiagnosticKind;
    sentryEventId?: string;
    extra?: unknown;
  },
): DiagnosticReport {
  const sessionId = currentSession?.sessionId ?? createId('session');
  return {
    schemaVersion: 1,
    id: createId('report'),
    createdAt: new Date().toISOString(),
    kind: options.kind,
    fatal: options.fatal,
    sentryEventId: options.sentryEventId,
    app: {
      name: Constants.expoConfig?.name ?? 'my-app',
      applicationId: Application.applicationId,
      version: Application.nativeApplicationVersion,
      buildVersion: Application.nativeBuildVersion,
    },
    runtime: {
      platform: Platform.OS,
      osVersion: String(Platform.Version),
      deviceModel: readDeviceModel(),
      reactNativeVersion: readReactNativeVersion(),
      jsEngine: readJsEngine(),
      newArchitecture: isNewArchitecture(),
      route: currentRoute,
      appState: currentAppState,
      sessionId,
    },
    error,
    contexts: {
      ...contexts,
      ...(options.extra === undefined
        ? {}
        : { exception: sanitizeValue(options.extra) }),
    },
    breadcrumbs: [...breadcrumbs],
  };
}

/** 只写入本地报告；Sentry 发送由 sentry.ts 统一控制。 */
export function recordException(
  error: unknown,
  options: {
    fatal?: boolean;
    kind?: DiagnosticKind;
    sentryEventId?: string;
    extra?: unknown;
  } = {},
): DiagnosticReport {
  const normalizedError = normalizeError(error);
  const fatal = options.fatal ?? false;
  const kind = options.kind ?? 'javascript';
  const fingerprint = [
    normalizedError.name,
    normalizedError.message,
    normalizedError.stack,
    kind,
    fatal,
  ].join('\u001f');
  if (
    lastRecorded?.fingerprint === fingerprint &&
    Date.now() - lastRecorded.recordedAt < 2_000
  ) {
    const current = getReport(lastRecorded.reportId);
    if (current !== null) {
      if (
        options.sentryEventId !== undefined &&
        current.sentryEventId === undefined
      ) {
        return (
          updateReport(current.id, (report) => ({
            ...report,
            sentryEventId: options.sentryEventId,
          })) ?? current
        );
      }
      return current;
    }
  }

  const report = createReport(normalizedError, {
    fatal,
    kind,
    sentryEventId: options.sentryEventId,
    extra: options.extra,
  });
  writeReport(report);
  lastRecorded = {
    fingerprint,
    recordedAt: Date.now(),
    reportId: report.id,
  };
  return report;
}

export function addLocalBreadcrumb(
  category: string,
  message: string,
  data?: unknown,
  level: DiagnosticLevel = 'info',
): void {
  const next = appendBounded(
    breadcrumbs,
    {
      timestamp: new Date().toISOString(),
      category,
      message: String(sanitizeValue(message, { maxStringLength: 1_000 })),
      level,
      data: data === undefined ? undefined : sanitizeValue(data),
    },
    MAX_BREADCRUMBS,
  );
  breadcrumbs.splice(0, breadcrumbs.length, ...next);
}

export function setLocalContext(name: string, value: unknown): void {
  contexts[name] = sanitizeValue(value);
}

export function setCurrentRoute(route: string): void {
  if (currentRoute === route) return;
  currentRoute = sanitizeUrl(route);
  if (currentSession !== null) {
    currentSession = {
      ...currentSession,
      lastSeenAt: new Date().toISOString(),
      route: currentRoute,
    };
    writeSession(currentSession);
  }
}

export function updateCurrentAppState(appState: string): void {
  currentAppState = appState;
  if (currentSession === null) return;
  currentSession = {
    ...currentSession,
    appState,
    lastSeenAt: new Date().toISOString(),
  };
  writeSession(currentSession);
}

/** 启动新会话并返回需要提示用户查看的最新报告。 */
export function beginDiagnosticSession(
  nativeCrashedLastRun: boolean,
): DiagnosticReport | null {
  pruneReports();
  const previous = readSession();
  const existingFatal = listReports().find(
    (report) =>
      report.fatal &&
      report.promptedAt === undefined &&
      (previous === null ||
        Date.parse(report.createdAt) >= Date.parse(previous.startedAt)),
  );

  if (
    existingFatal === undefined &&
    isAbnormalPreviousSession(previous, nativeCrashedLastRun)
  ) {
    recordException(
      nativeCrashedLastRun
        ? new Error('Sentry 检测到上次运行发生原生崩溃')
        : new Error('上次运行在前台异常结束'),
      {
        fatal: true,
        kind: nativeCrashedLastRun ? 'native' : 'abnormal-termination',
        extra: { previousSession: previous },
      },
    );
  }

  const now = new Date().toISOString();
  currentSession = {
    sessionId: createId('session'),
    startedAt: now,
    lastSeenAt: now,
    appState: currentAppState,
    route: currentRoute,
    endedCleanly: false,
  };
  writeSession(currentSession);
  return (
    listReports().find(
      (report) => report.fatal && report.promptedAt === undefined,
    ) ?? null
  );
}

export function endDiagnosticSession(): void {
  if (currentSession === null) return;
  currentSession = {
    ...currentSession,
    endedCleanly: true,
    lastSeenAt: new Date().toISOString(),
  };
  writeSession(currentSession);
}

export function markReportPrompted(id: string): void {
  updateReport(id, (report) => ({
    ...report,
    promptedAt: report.promptedAt ?? new Date().toISOString(),
  }));
}

export function markReportViewed(id: string): DiagnosticReport | null {
  return updateReport(id, (report) => ({
    ...report,
    viewedAt: report.viewedAt ?? new Date().toISOString(),
  }));
}

export function readReport(id: string): DiagnosticReport | null {
  return getReport(id);
}
