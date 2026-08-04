import { createContext, use } from 'react';
import type { SharedValue } from 'react-native-reanimated';

import { RefreshState, type RefreshState as RefreshStateValue } from './types';

export interface RefreshAnimationContextValue {
  /** 当前下拉位移，单位为 dp/pt。 */
  offset: SharedValue<number>;
  /** 相对于 Header 高度的标准化下拉进度，范围为 0...1。 */
  progress: SharedValue<number>;
  /** 适合文字、指示器等低频界面切换的 React 状态。 */
  state: RefreshStateValue;
  /** 适合 Reanimated worklet 判断的界面线程状态。 */
  stateValue: SharedValue<RefreshStateValue>;
  /** 当前已校验的固定 Header 高度。 */
  headerHeight: number;
}

const RefreshAnimationContext =
  createContext<RefreshAnimationContextValue | null>(null);

export const RefreshAnimationProvider = RefreshAnimationContext.Provider;

export function useRefreshAnimation(): RefreshAnimationContextValue {
  const value = use(RefreshAnimationContext);
  if (value == null) {
    throw new Error('刷新头动画必须渲染在 RefreshLayout 内。');
  }
  return value;
}

export const INITIAL_REFRESH_STATE = RefreshState.Idle;
