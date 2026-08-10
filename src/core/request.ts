import * as Network from 'expo-network';
import { addBreadcrumb, sanitizeUrl } from 'react-native-diagnostics';
import { createRequest } from 'react-native-request-kit';
import { createAsyncStoragePersister } from 'react-native-request-kit/cache';
import { useAutoRequest } from 'react-native-request-kit/strategy';

import { storage } from './storage';

const requestStartedAt = new WeakMap<object, number>();

useAutoRequest.onNetwork = (notify) => {
  const subscription = Network.addNetworkStateListener((state) => {
    if (state.isConnected) notify();
  });
  return () => subscription.remove();
};

export const request = createRequest({
  baseUrl: process.env.EXPO_PUBLIC_API_URL,
  beforeRequest: (method) => {
    requestStartedAt.set(method, Date.now());
  },
  responded: {
    onComplete: (method, result) => {
      const startedAt = requestStartedAt.get(method);
      requestStartedAt.delete(method);
      addBreadcrumb(
        'http',
        result.status === 'success' ? '请求完成' : '请求失败',
        {
          method: method.type,
          path: sanitizeUrl(method.url),
          durationMs:
            startedAt === undefined
              ? null
              : Math.max(0, Date.now() - startedAt),
          result: result.status,
          statusCode: result.error?.status,
          errorCode: result.error?.code,
        },
        result.status === 'success' ? 'info' : 'warning',
      );
    },
  },
  StoragePersister: createAsyncStoragePersister({
    key: 'MY_APP_REQUEST_CACHE',
    storage,
  }),
});
