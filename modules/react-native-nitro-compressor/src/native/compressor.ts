import { NitroModules } from 'react-native-nitro-modules';

import type { Compressor } from '../specs/Compressor.nitro';

export const nativeCompressor =
  NitroModules.createHybridObject<Compressor>('Compressor');
