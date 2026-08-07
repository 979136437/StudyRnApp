import { NitroModules } from 'react-native-nitro-modules';

import type { ImagePicker } from '../specs/ImagePicker.nitro';

export const nativeImagePicker =
  NitroModules.createHybridObject<ImagePicker>('ImagePicker');
