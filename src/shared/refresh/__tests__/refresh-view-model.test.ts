import { RefreshState } from 'react-native-nitro-refresh';
import { describe, expect, it } from 'vitest';

import {
  formatRefreshTime,
  isRefreshIndicatorVisible,
  labelForRefreshState,
  shouldResetRefreshAnimation,
} from '../refresh-view-model';

describe('普通刷新头视图状态', () => {
  it('为四阶段提供对应文案', () => {
    expect(labelForRefreshState(RefreshState.Idle)).toBe('下拉刷新');
    expect(labelForRefreshState(RefreshState.Pulling)).toBe('松开立即刷新');
    expect(labelForRefreshState(RefreshState.Refreshing)).toBe('正在刷新...');
    expect(labelForRefreshState(RefreshState.End)).toBe('刷新完成');
    expect(labelForRefreshState(RefreshState.Max)).toBe('已达到二级阈值');
  });

  it('仅在 Refreshing 显示加载指示器', () => {
    expect(isRefreshIndicatorVisible(RefreshState.Idle)).toBe(false);
    expect(isRefreshIndicatorVisible(RefreshState.Pulling)).toBe(false);
    expect(isRefreshIndicatorVisible(RefreshState.Refreshing)).toBe(true);
    expect(isRefreshIndicatorVisible(RefreshState.End)).toBe(false);
    expect(isRefreshIndicatorVisible(RefreshState.Max)).toBe(false);
  });

  it('按两位小时和分钟格式化最后更新时间', () => {
    expect(formatRefreshTime(new Date(2026, 7, 4, 8, 5))).toBe('08:05');
  });
});

describe('动画刷新头视图状态', () => {
  it('End 和 Idle 复位，Pulling 和 Refreshing 不提前复位', () => {
    expect(shouldResetRefreshAnimation(RefreshState.Idle)).toBe(true);
    expect(shouldResetRefreshAnimation(RefreshState.Pulling)).toBe(false);
    expect(shouldResetRefreshAnimation(RefreshState.Refreshing)).toBe(false);
    expect(shouldResetRefreshAnimation(RefreshState.End)).toBe(true);
    expect(shouldResetRefreshAnimation(RefreshState.Max)).toBe(false);
  });
});
