import { createRequestStrategy } from 'react-native-request-strategy';

export const requestStrategy = createRequestStrategy({
  baseUrl: process.env.EXPO_PUBLIC_API_URL,
  persistence: {
    buster: '1',
    key: 'MY_APP_REQUEST_CACHE',
  },
});
