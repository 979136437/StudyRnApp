import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearNitroRecyclerTraceLog,
  getNitroRecyclerTraceLog,
  logNitroRecyclerTrace,
} from '../trace';

describe('NitroRecyclerTrace 日志缓冲', () => {
  beforeEach(() => {
    clearNitroRecyclerTraceLog();
  });

  it('保留带时间和日志前缀的可导出内容', () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});

    logNitroRecyclerTrace('JS refresh-phase', 'list-1', 'pulling');

    expect(getNitroRecyclerTraceLog()).toMatch(
      /^\d{4}-\d{2}-\d{2}T.* INFO NitroRecyclerTrace JS refresh-phase list-1 pulling$/,
    );
    expect(consoleInfo).toHaveBeenCalledWith(
      'NitroRecyclerTrace',
      'JS refresh-phase',
      'list-1',
      'pulling',
    );
    consoleInfo.mockRestore();
  });
});
