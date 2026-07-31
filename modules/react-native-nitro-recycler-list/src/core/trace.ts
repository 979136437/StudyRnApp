const TRACE_CAPACITY = 5_000;
const traceLines: string[] = [];

/** 记录并输出可由测试页面直接导出的 RecyclerList JavaScript 运行轨迹。 */
export function logNitroRecyclerTrace(...parts: string[]): void {
  const line = `${new Date().toISOString()} INFO NitroRecyclerTrace ${parts.join(' ')}`;
  traceLines.push(line);
  if (traceLines.length > TRACE_CAPACITY) {
    traceLines.splice(0, traceLines.length - TRACE_CAPACITY);
  }
  console.info('NitroRecyclerTrace', ...parts);
}

/** 返回当前进程内按时间顺序排列的 RecyclerList 运行轨迹。 */
export function getNitroRecyclerTraceLog(): string {
  return traceLines.join('\n');
}

/** 清空当前进程内已经收集的 RecyclerList 运行轨迹。 */
export function clearNitroRecyclerTraceLog(): void {
  traceLines.length = 0;
}
