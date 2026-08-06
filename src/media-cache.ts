import AsyncStorage from '@react-native-async-storage/async-storage';
import { createFileMediaCacheStrategy } from 'react-native-components';

const MEBIBYTE = 1024 * 1024;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

// 容量与有效期集中在应用层配置，避免组件包替业务决定缓存成本。
export const mediaCacheStrategy = createFileMediaCacheStrategy({
  defaultMaxAgeMs: 7 * DAY_IN_MILLISECONDS,
  imageMaxSizeBytes: 128 * MEBIBYTE,
  storage: {
    getItem: (key) => AsyncStorage.getItem(key),
    removeItem: (key) => AsyncStorage.removeItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
  },
  videoMaxSizeBytes: 1024 * MEBIBYTE,
});
