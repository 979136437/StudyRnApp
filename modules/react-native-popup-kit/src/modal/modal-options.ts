import type { ModalOptions, ResolvedModalAction } from './types';

export const DEFAULT_CONFIRM_TEXT = '确定';
export const DEFAULT_CANCEL_TEXT = '取消';

export function resolveModalAction(
  action: ModalOptions['confirm'],
  defaultText: string,
): ResolvedModalAction {
  return {
    ...action,
    text: action?.text ?? defaultText,
  };
}
