import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { createRequest } from 'react-native-request-kit';
import { createAsyncStoragePersister } from 'react-native-request-kit/cache';
import { useAutoRequest } from 'react-native-request-kit/strategy';

useAutoRequest.onNetwork = (notify) => {
  const subscription = Network.addNetworkStateListener((state) => {
    if (state.isConnected) notify();
  });
  return () => subscription.remove();
};

export const request = createRequest({
  baseUrl: process.env.EXPO_PUBLIC_API_URL,
  StoragePersister: createAsyncStoragePersister({
    key: 'MY_APP_REQUEST_CACHE',
    storage: AsyncStorage,
  }),
});
