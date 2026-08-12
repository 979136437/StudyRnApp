import {
  compressImage,
  compressVideo,
  createVideoThumbnail,
  getImageMetadata,
  getVideoMetadata,
} from 'react-native-nitro-compressor';

import { unavailable } from '../core/error';
import { isWeb } from './platform';

const assertNative = () => {
  if (isWeb()) throw unavailable('原生媒体处理');
};

export const compressorAdapter = {
  compressImage(source: string, options: Parameters<typeof compressImage>[1]) {
    assertNative();
    return compressImage(source, options);
  },
  compressVideo(source: string, options: Parameters<typeof compressVideo>[1]) {
    assertNative();
    return compressVideo(source, options);
  },
  createThumbnail(
    source: string,
    options: Parameters<typeof createVideoThumbnail>[1],
  ) {
    assertNative();
    return createVideoThumbnail(source, options);
  },
  async imageMetadata(source: string) {
    assertNative();
    return getImageMetadata(source);
  },
  async videoMetadata(source: string) {
    assertNative();
    return getVideoMetadata(source);
  },
};
