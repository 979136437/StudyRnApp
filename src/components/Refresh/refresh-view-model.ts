import {
  RefreshState,
  type RefreshState as RefreshStateValue,
} from '../../../modules/react-native-nitro-refresh/src/types';

/** 普通头和动画头共用的中文状态文案，避免两个组件分别维护魔法字符串。 */
const REFRESH_STATE_LABELS = {
  [RefreshState.Idle]: '下拉刷新',
  [RefreshState.Pulling]: '松开立即刷新',
  [RefreshState.Refreshing]: '正在刷新...',
  [RefreshState.End]: '刷新完成',
  [RefreshState.Max]: '已达到二级阈值',
} as const;

export function labelForRefreshState(state: RefreshStateValue): string {
  return REFRESH_STATE_LABELS[state];
}

export function isRefreshIndicatorVisible(state: RefreshStateValue): boolean {
  return state === RefreshState.Refreshing;
}

export function shouldResetRefreshAnimation(state: RefreshStateValue): boolean {
  return state === RefreshState.End || state === RefreshState.Idle;
}

export function formatRefreshTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
