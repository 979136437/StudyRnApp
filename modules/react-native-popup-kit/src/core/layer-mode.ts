import type { PopupLayerMode } from '../types';

export function resolvePopupLayerMode(
  requestedMode: PopupLayerMode | undefined,
  expoOS: string | undefined,
): PopupLayerMode {
  if (expoOS === 'web') return 'inline';
  return requestedMode ?? 'native';
}
