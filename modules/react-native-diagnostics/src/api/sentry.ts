import * as Sentry from '@sentry/react-native';
import type {
  Breadcrumb as SentryBreadcrumb,
  ErrorEvent as SentryErrorEvent,
  Event as SentryEvent,
} from '@sentry/react-native';

import { redactTransportValue, sanitizeValue } from '../core/sanitizer';
import {
  addLocalBreadcrumb,
  recordException,
  setLocalContext,
} from './diagnostics';
import type { DiagnosticKind, DiagnosticLevel, JsonValue } from '../types';

const DEFAULT_SENTRY_DSN =
  'https://01c1c1928d318c42b107a1b82746970d@o4511827492208640.ingest.us.sentry.io/4511827497910272';
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN ?? DEFAULT_SENTRY_DSN;
const sentryEnabled = sentryDsn.length > 0;
let initialized = false;
let globalHandlerInstalled = false;

function diagnosticLevel(level: SentryBreadcrumb['level']): DiagnosticLevel {
  if (
    level === 'fatal' ||
    level === 'error' ||
    level === 'warning' ||
    level === 'debug'
  ) {
    return level;
  }
  return 'info';
}

type SentryEventHint = { originalException?: unknown };

function readOriginalError(
  event: SentryEvent,
  hint?: SentryEventHint,
): unknown {
  if (hint?.originalException !== undefined) return hint.originalException;
  const exception = event.exception?.values?.[0];
  return new Error(
    exception?.value ?? event.message ?? 'Sentry 捕获到未命名异常',
  );
}

function isFatalEvent(event: SentryEvent): boolean {
  if (event.level === 'fatal') return true;
  return (
    event.exception?.values?.some(
      (value) => value.mechanism?.handled === false,
    ) ?? false
  );
}

function readDiagnosticKind(event: SentryEvent): DiagnosticKind {
  const kind = event.tags?.['diagnostics.kind'];
  return kind === 'react' || kind === 'manual' ? kind : 'javascript';
}

function sanitizeSentryEvent(event: SentryErrorEvent): SentryErrorEvent {
  return redactTransportValue(event);
}

function sanitizeSentryBreadcrumb(
  breadcrumb: SentryBreadcrumb,
): SentryBreadcrumb {
  return redactTransportValue(breadcrumb);
}

export function initializeSentry(): void {
  if (initialized) return;
  initialized = true;
  Sentry.init({
    dsn: sentryDsn,
    enabled: sentryEnabled,
    sendDefaultPii: false,
    attachStacktrace: true,
    enableNative: true,
    enableNativeCrashHandling: true,
    enableAutoSessionTracking: true,
    maxBreadcrumbs: 100,
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeBreadcrumb(breadcrumb) {
      const sanitized = sanitizeSentryBreadcrumb(breadcrumb);
      addLocalBreadcrumb(
        sanitized.category ?? 'sentry',
        sanitized.message ?? sanitized.category ?? 'Sentry breadcrumb',
        sanitized.data,
        diagnosticLevel(sanitized.level),
      );
      return sanitized;
    },
    beforeSend(event, hint) {
      try {
        recordException(readOriginalError(event, hint), {
          fatal: isFatalEvent(event),
          kind: readDiagnosticKind(event),
          sentryEventId: event.event_id,
          extra: {
            contexts: event.contexts,
            tags: event.tags,
          },
        });
      } catch {
        // 本地存储异常不能阻止 Sentry 上传原始崩溃。
      }
      return sanitizeSentryEvent(event);
    },
  });
}

type ErrorUtilsLike = {
  getGlobalHandler(): (error: Error, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: Error, isFatal?: boolean) => void): void;
};

/** 在 Sentry 全局处理器外再加本地兜底，并始终委托原处理器。 */
export function installGlobalErrorHandler(): void {
  if (globalHandlerInstalled) return;
  const runtime = globalThis as typeof globalThis & {
    ErrorUtils?: ErrorUtilsLike;
  };
  const errorUtils = runtime.ErrorUtils;
  if (errorUtils === undefined) return;
  globalHandlerInstalled = true;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    try {
      recordException(error, { fatal: isFatal === true, kind: 'javascript' });
    } catch {
      // 诊断写入失败不能阻止 React Native 继续执行原异常处理流程。
    }
    previous(error, isFatal);
  });
}

export function isSentryEnabled(): boolean {
  return sentryEnabled;
}

export function addBreadcrumb(
  category: string,
  message: string,
  data?: unknown,
  level: DiagnosticLevel = 'info',
): void {
  if (!sentryEnabled) {
    addLocalBreadcrumb(category, message, data, level);
    return;
  }
  const sanitized = sanitizeValue(data);
  const breadcrumbData =
    sanitized !== null &&
    typeof sanitized === 'object' &&
    !Array.isArray(sanitized)
      ? sanitized
      : { value: sanitized };
  Sentry.addBreadcrumb({ category, message, data: breadcrumbData, level });
}

export function setContext(name: string, value: unknown): void {
  const sanitized = sanitizeValue(value);
  setLocalContext(name, sanitized);
  if (
    sentryEnabled &&
    sanitized !== null &&
    typeof sanitized === 'object' &&
    !Array.isArray(sanitized)
  ) {
    Sentry.setContext(name, sanitized as Record<string, JsonValue>);
  }
}

export function captureException(
  error: unknown,
  context: { kind?: DiagnosticKind; extra?: unknown; fatal?: boolean } = {},
): string | undefined {
  if (!sentryEnabled) {
    return recordException(error, {
      fatal: context.fatal,
      kind: context.kind,
      extra: context.extra,
    }).id;
  }
  return Sentry.withScope((scope) => {
    scope.setTag('diagnostics.kind', context.kind ?? 'manual');
    scope.setLevel(context.fatal ? 'fatal' : 'error');
    const extra = sanitizeValue(context.extra);
    if (extra !== null && typeof extra === 'object' && !Array.isArray(extra)) {
      scope.setContext('diagnostics', extra as Record<string, JsonValue>);
    }
    return Sentry.captureException(error);
  });
}

export async function crashedLastRun(): Promise<boolean> {
  if (!sentryEnabled) return false;
  return (await Sentry.crashedLastRun()) === true;
}

export function triggerNativeCrash(): void {
  Sentry.nativeCrash();
}

export function wrapWithSentry<P extends Record<string, unknown>>(
  component: React.ComponentType<P>,
): React.ComponentType<P> {
  return sentryEnabled ? Sentry.wrap(component) : component;
}
