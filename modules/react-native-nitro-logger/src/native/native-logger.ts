import { NitroModules } from 'react-native-nitro-modules';

import type { NativeLogEntry, NativeLogger } from '../specs/NativeLogger.nitro';

let nativeLogger: NativeLogger | undefined;
let nativeUnavailable = false;

export function enqueueNativeLogs(entries: NativeLogEntry[]): boolean {
  if (nativeUnavailable) {
    return false;
  }
  try {
    nativeLogger ??=
      NitroModules.createHybridObject<NativeLogger>('NativeLogger');
    nativeLogger.enqueue(entries);
    return true;
  } catch {
    nativeUnavailable = true;
    return false;
  }
}
