import type { ViewStyle } from 'react-native';

import { PopupMode } from '../constants';
import type { PopupMode as PopupModeValue } from '../types';

export function getPopupAlignment(mode: PopupModeValue): ViewStyle {
  switch (mode) {
    case PopupMode.TOP:
      return { justifyContent: 'flex-start' };
    case PopupMode.BOTTOM:
      return { justifyContent: 'flex-end' };
    case PopupMode.LEFT:
      return { alignItems: 'flex-start' };
    case PopupMode.RIGHT:
      return { alignItems: 'flex-end' };
    default:
      return { alignItems: 'center', justifyContent: 'center' };
  }
}

export function getPopupSize(mode: PopupModeValue): ViewStyle {
  switch (mode) {
    case PopupMode.TOP:
    case PopupMode.BOTTOM:
      return { maxHeight: '75%', width: '100%' };
    case PopupMode.LEFT:
    case PopupMode.RIGHT:
      return { height: '100%', maxWidth: '85%' };
    case PopupMode.FULLSCREEN:
      return { height: '100%', width: '100%' };
    default:
      return { maxHeight: '85%', maxWidth: '85%' };
  }
}
