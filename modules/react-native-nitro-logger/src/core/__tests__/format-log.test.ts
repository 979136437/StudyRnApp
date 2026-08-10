import { describe, expect, it } from 'vitest';

import type { QueuedLogEntry } from '../../types';
import {
  formatJavaScriptLog,
  formatLogPayload,
  normalizeLogToken,
  toNativeLogEntry,
} from '../format-log';

describe('日志格式化', () => {
  const entry: QueuedLogEntry = {
    createdAt: new Date(2026, 7, 10, 16, 42, 1, 123).getTime(),
    elapsedMs: 122.6,
    event: 'gesture.move',
    fields: {
      translation: 128.4567,
      key: 'item 01',
      omitted: undefined,
      session: 3,
    },
    level: 'debug',
    sequence: 42,
  };

  it('生成稳定的单行 payload', () => {
    expect(formatLogPayload(entry)).toBe(
      '#0042 +123ms gesture.move key="item 01" session=3 translation=128.457',
    );
  });

  it('为 JavaScript 输出补充 Logcat 风格前缀', () => {
    expect(formatJavaScriptLog('InteractiveList', entry)).toBe(
      '08-10 16:42:01.123 D/InteractiveList: #0042 +123ms gesture.move key="item 01" session=3 translation=128.457',
    );
  });

  it('原生批次只包含等级、标签和 payload', () => {
    expect(toNativeLogEntry('InteractiveList', entry)).toEqual({
      level: 'debug',
      message:
        '#0042 +123ms gesture.move key="item 01" session=3 translation=128.457',
      tag: 'InteractiveList',
    });
  });

  it('清理标签和事件中的换行', () => {
    expect(normalizeLogToken('  Drag\nList  ', 'App')).toBe('Drag List');
    expect(normalizeLogToken('\n', 'App')).toBe('App');
  });
});
