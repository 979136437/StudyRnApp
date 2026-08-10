import type { NativeLogEntry } from '../specs/NativeLogger.nitro';

export function enqueueNativeLogs(_entries: NativeLogEntry[]): boolean {
  return false;
}
