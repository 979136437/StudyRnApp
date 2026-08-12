import * as Sharing from 'expo-sharing';

import { unavailable } from '../core/error';
import { isWeb } from './platform';

export const shareLocalFile = async (uri: string) => {
  if (isWeb() || !(await Sharing.isAvailableAsync()))
    throw unavailable('媒体分享');
  await Sharing.shareAsync(uri);
};
