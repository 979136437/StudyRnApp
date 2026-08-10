import { createMMKV } from 'react-native-mmkv';

const mmkv = createMMKV();

export const storage = {
  async getItem(key: string): Promise<string | null> {
    return mmkv.getString(key) ?? null;
  },
  async removeItem(key: string): Promise<void> {
    mmkv.remove(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    mmkv.set(key, value);
  },
};
