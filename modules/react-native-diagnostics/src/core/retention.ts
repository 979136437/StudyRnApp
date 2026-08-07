import type { DiagnosticReport } from '../types';

/** 计算因数量或保存期限限制而需要删除的报告标识。 */
export function selectReportsToDelete(
  reports: readonly DiagnosticReport[],
  now: number,
  limit: number,
  maxAge: number,
): string[] {
  const expiry = now - maxAge;
  return [...reports]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .filter(
      (report, index) =>
        index >= Math.max(0, limit) || Date.parse(report.createdAt) < expiry,
    )
    .map((report) => report.id);
}
