import type { DiagnosticSession } from '../types';

/** 判断未正常结束的上一会话是否值得生成本地异常退出报告。 */
export function isAbnormalPreviousSession(
  session: DiagnosticSession | null,
  nativeCrashedLastRun: boolean,
): boolean {
  if (nativeCrashedLastRun) return true;
  if (session === null || session.endedCleanly) return false;
  return session.appState === 'active';
}
