import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storage } from '../storage';

const mmkv = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    getString: vi.fn((key: string) => values.get(key)),
    remove: vi.fn((key: string) => values.delete(key)),
    set: vi.fn((key: string, value: string) => values.set(key, value)),
    values,
  };
});

vi.mock('react-native-mmkv', () => ({
  createMMKV: () => mmkv,
}));

describe('MMKV 字符串存储适配器', () => {
  beforeEach(() => {
    mmkv.values.clear();
    vi.clearAllMocks();
  });

  it('缺失键返回 null', async () => {
    await expect(storage.getItem('missing')).resolves.toBeNull();
  });

  it('写入并读取字符串', async () => {
    await storage.setItem('cache', 'value');

    await expect(storage.getItem('cache')).resolves.toBe('value');
  });

  it('删除已存储的值', async () => {
    await storage.setItem('cache', 'value');
    await storage.removeItem('cache');

    await expect(storage.getItem('cache')).resolves.toBeNull();
  });
});
