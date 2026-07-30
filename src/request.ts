import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createAsyncStoragePersister,
  createRequest,
} from 'react-native-request-kit';

export const request = createRequest({
  baseUrl: process.env.EXPO_PUBLIC_API_URL,
  StoragePersister: createAsyncStoragePersister({
    key: 'MY_APP_REQUEST_CACHE',
    storage: AsyncStorage,
  }),
});
