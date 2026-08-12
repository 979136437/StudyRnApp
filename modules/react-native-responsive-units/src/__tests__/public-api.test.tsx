import { StrictMode } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';

import {
  ResponsiveProvider,
  height,
  px2dp,
  rpx,
  useResponsiveUpdate,
  width,
} from '../index';
import { setWindowDimensions } from './react-native.mock';

function ResponsiveConsumer(): null {
  useResponsiveUpdate();
  return null;
}

describe('公开 API', () => {
  it('导出约定的组件、Hook 和换算函数', () => {
    expect(ResponsiveProvider).toBeTypeOf('function');
    expect(useResponsiveUpdate).toBeTypeOf('function');
    expect(rpx).toBeTypeOf('function');
    expect(px2dp).toBeTypeOf('function');
    expect(width).toBeTypeOf('function');
    expect(height).toBeTypeOf('function');
  });

  it('Provider 在子组件渲染前激活窗口快照', () => {
    setWindowDimensions(375, 812);
    let renderer: ReturnType<typeof create> | undefined;

    act(() => {
      renderer = create(
        <ResponsiveProvider designWidth={750}>
          <ResponsiveConsumer />
        </ResponsiveProvider>,
      );
    });

    expect(rpx(24)).toBe(12);
    expect(width(0.5)).toBe(187.5);

    act(() => renderer?.unmount());
    expect(() => rpx(24)).toThrow(/ResponsiveProvider/);
  });

  it('React 严格模式模拟卸载后保持快照可用', () => {
    setWindowDimensions(390, 844);
    let renderer: ReturnType<typeof create> | undefined;

    act(() => {
      renderer = create(
        <StrictMode>
          <ResponsiveProvider designWidth={750}>
            <ResponsiveConsumer />
          </ResponsiveProvider>
        </StrictMode>,
      );
    });

    expect(rpx(100)).toBe(52);
    act(() => renderer?.unmount());
  });

  it('拒绝在 Provider 外使用更新 Hook', () => {
    expect(() => {
      act(() => {
        create(<ResponsiveConsumer />);
      });
    }).toThrow(/ResponsiveProvider/);
  });
});
