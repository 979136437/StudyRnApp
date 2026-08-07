import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { selectReportsToDelete } from '../core/retention';
import { serializeReport } from '../core/sanitizer';
import type {
  DiagnosticReport,
  DiagnosticReportSummary,
  DiagnosticSession,
} from '../types';

const REPORT_DIRECTORY = 'diagnostics';
const EXPORT_DIRECTORY = 'diagnostic-exports';
const SESSION_FILE = 'session.json';
const REPORT_PREFIX = 'diagnostic-';
const REPORT_LIMIT = 10;
const REPORT_MAX_AGE = 7 * 24 * 60 * 60 * 1_000;

const memoryReports = new Map<string, DiagnosticReport>();
let memorySession: DiagnosticSession | null = null;
const listeners = new Set<() => void>();

function supportsFiles(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

function reportDirectory(): Directory {
  return new Directory(Paths.document, REPORT_DIRECTORY);
}

function exportDirectory(): Directory {
  return new Directory(Paths.cache, EXPORT_DIRECTORY);
}

function ensureDirectory(directory: Directory): void {
  directory.create({ idempotent: true, intermediates: true });
}

function reportFile(id: string): File {
  return new File(reportDirectory(), `${REPORT_PREFIX}${id}.json`);
}

function isDiagnosticReport(value: unknown): value is DiagnosticReport {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<DiagnosticReport>;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.id === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.kind === 'string' &&
    candidate.error !== undefined
  );
}

function notify(): void {
  for (const listener of listeners) listener();
}

function readReportFile(file: File): DiagnosticReport | null {
  try {
    const parsed: unknown = JSON.parse(file.textSync());
    return isDiagnosticReport(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 返回按创建时间倒序排列的本地报告。 */
export function listReports(): DiagnosticReport[] {
  if (!supportsFiles()) {
    return [...memoryReports.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }
  try {
    const directory = reportDirectory();
    const persisted = directory.exists
      ? directory
          .list()
          .filter(
            (entry): entry is File =>
              entry instanceof File &&
              entry.name.startsWith(REPORT_PREFIX) &&
              entry.name.endsWith('.json'),
          )
          .map(readReportFile)
          .filter((report): report is DiagnosticReport => report !== null)
      : [];
    const reports = new Map(
      persisted.map((report) => [report.id, report] as const),
    );
    for (const report of memoryReports.values()) reports.set(report.id, report);
    return [...reports.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  } catch {
    return [...memoryReports.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }
}

export function listReportSummaries(): DiagnosticReportSummary[] {
  return listReports().map((report) => ({
    id: report.id,
    createdAt: report.createdAt,
    kind: report.kind,
    fatal: report.fatal,
    promptedAt: report.promptedAt,
    viewedAt: report.viewedAt,
    sentryEventId: report.sentryEventId,
    errorName: report.error.name,
    errorMessage: report.error.message,
    platform: report.runtime.platform,
    appVersion: report.app.version,
  }));
}

export function getReport(id: string): DiagnosticReport | null {
  if (!supportsFiles()) return memoryReports.get(id) ?? null;
  try {
    const file = reportFile(id);
    return file.exists
      ? (readReportFile(file) ?? memoryReports.get(id) ?? null)
      : (memoryReports.get(id) ?? null);
  } catch {
    return memoryReports.get(id) ?? null;
  }
}

function removeExpiredReports(): void {
  const reports = listReports();
  for (const id of selectReportsToDelete(
    reports,
    Date.now(),
    REPORT_LIMIT,
    REPORT_MAX_AGE,
  )) {
    deleteReport(id, false);
  }
}

/** 同步保存关键异常，保证 JS 运行终止前尽可能完成落盘。 */
export function writeReport(report: DiagnosticReport): void {
  if (!supportsFiles()) {
    memoryReports.set(report.id, report);
    removeExpiredReports();
    notify();
    return;
  }
  try {
    const directory = reportDirectory();
    ensureDirectory(directory);
    const file = reportFile(report.id);
    file.create({ intermediates: true, overwrite: true });
    file.write(serializeReport(report));
    memoryReports.delete(report.id);
  } catch {
    // 文件系统不可用时保留进程内副本，避免诊断逻辑掩盖原始异常。
    memoryReports.set(report.id, report);
  }
  removeExpiredReports();
  notify();
}

export function updateReport(
  id: string,
  update: (report: DiagnosticReport) => DiagnosticReport,
): DiagnosticReport | null {
  const current = getReport(id);
  if (current === null) return null;
  const next = update(current);
  writeReport(next);
  return next;
}

export function deleteReport(id: string, shouldNotify = true): void {
  memoryReports.delete(id);
  if (supportsFiles()) {
    try {
      const file = reportFile(id);
      if (file.exists) file.delete();
    } catch {
      // 删除失败时保留原报告，避免影响诊断中心继续使用。
    }
  }
  if (shouldNotify) notify();
}

export function clearReports(): void {
  for (const report of listReports()) deleteReport(report.id, false);
  notify();
}

export function readSession(): DiagnosticSession | null {
  if (!supportsFiles()) return memorySession;
  try {
    const file = new File(reportDirectory(), SESSION_FILE);
    if (!file.exists) return null;
    const parsed = JSON.parse(file.textSync()) as Partial<DiagnosticSession>;
    return typeof parsed.sessionId === 'string' &&
      typeof parsed.startedAt === 'string'
      ? (parsed as DiagnosticSession)
      : null;
  } catch {
    return memorySession;
  }
}

export function writeSession(session: DiagnosticSession): void {
  if (!supportsFiles()) {
    memorySession = session;
    return;
  }
  try {
    const directory = reportDirectory();
    ensureDirectory(directory);
    const file = new File(directory, SESSION_FILE);
    file.create({ intermediates: true, overwrite: true });
    file.write(JSON.stringify(session));
    memorySession = null;
  } catch {
    memorySession = session;
  }
}

/** 通过系统分享面板导出单个结构化 JSON 报告。 */
export async function exportReport(id: string): Promise<void> {
  const report = getReport(id);
  if (report === null) throw new Error('诊断报告不存在或已经被删除');
  if (!supportsFiles() || !(await Sharing.isAvailableAsync())) {
    throw new Error('当前平台不支持导出本地诊断文件');
  }
  const directory = exportDirectory();
  ensureDirectory(directory);
  const file = new File(directory, `${REPORT_PREFIX}${id}.json`);
  file.create({ intermediates: true, overwrite: true });
  file.write(serializeReport(report));
  await Sharing.shareAsync(file.uri, {
    dialogTitle: '导出诊断报告',
    mimeType: 'application/json',
    UTI: 'public.json',
  });
}

export async function exportLatestReport(): Promise<void> {
  const latest = listReports()[0];
  if (latest === undefined) throw new Error('没有可导出的诊断报告');
  await exportReport(latest.id);
}

export function subscribeToReports(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function pruneReports(): void {
  removeExpiredReports();
}
