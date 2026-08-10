import { NitroModules } from 'react-native-nitro-modules';

import type { ImagePicker } from '../specs/ImagePicker.nitro';

let nativeImagePicker: ImagePicker | undefined;

export function getNativeImagePicker(): ImagePicker {
  nativeImagePicker ??=
    NitroModules.createHybridObject<ImagePicker>('ImagePicker');
  return nativeImagePicker;
}
