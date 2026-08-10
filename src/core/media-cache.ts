import { createFileMediaCacheStrategy } from 'react-native-components';

import { storage } from './storage';

const MEBIBYTE = 1024 * 1024;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

// 容量与有效期集中在应用层配置，避免组件包替业务决定缓存成本。
export const mediaCacheStrategy = createFileMediaCacheStrategy({
  defaultMaxAgeMs: 7 * DAY_IN_MILLISECONDS,
  imageMaxSizeBytes: 128 * MEBIBYTE,
  storage,
  videoMaxSizeBytes: 1024 * MEBIBYTE,
});
