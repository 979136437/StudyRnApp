import { afterEach, describe, expect, it } from 'vitest';

import {
  activateResponsiveRuntime,
  createResponsiveRuntime,
  deactivateResponsiveRuntime,
} from '../responsive-runtime';
import { height, px2dp, rpx, width } from '../responsive-units';

let runtime: ReturnType<typeof createResponsiveRuntime> | undefined;

function mountRuntime(
  designWidth = 750,
  viewportWidth = 375,
  viewportHeight = 812,
): void {
  runtime = createResponsiveRuntime(
    designWidth,
    viewportWidth,
    viewportHeight,
  );
  activateResponsiveRuntime(runtime);
}

afterEach(() => {
  if (runtime !== undefined) {
    deactivateResponsiveRuntime(runtime);
    runtime = undefined;
  }
});

describe('设计稿尺寸换算', () => {
  it('按设计稿宽度换算并保留小数', () => {
    mountRuntime();
    expect(rpx(24)).toBe(12);
    expect(rpx(1)).toBe(0.5);
    expect(rpx(-24)).toBe(-12);
  });

  it('px2dp 与 rpx 完全等价', () => {
    mountRuntime(750, 390, 844);
    expect(px2dp).toBe(rpx);
    expect(px2dp(24)).toBe(rpx(24));
  });

  it('窗口变化后使用新的快照换算', () => {
    mountRuntime(750, 375, 812);
    expect(rpx(100)).toBe(50);
    mountRuntime(750, 750, 375);
    expect(rpx(100)).toBe(100);
  });
});

describe('窗口百分比换算', () => {
  it('支持边界值和中间比例', () => {
    mountRuntime();
    expect(width(0)).toBe(0);
    expect(width(0.5)).toBe(187.5);
    expect(width(1)).toBe(375);
    expect(height(0.25)).toBe(203);
  });

  it('将超范围比例夹在 0 到 1 之间', () => {
    mountRuntime();
    expect(width(-0.5)).toBe(0);
    expect(width(1.5)).toBe(375);
    expect(height(-1)).toBe(0);
    expect(height(2)).toBe(812);
  });
});

describe('参数防御', () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    '拒绝非法设计宽度 %s',
    (designWidth) => {
      expect(() => createResponsiveRuntime(designWidth, 375, 812)).toThrow(
        /designWidth/,
      );
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    '拒绝非有限换算值 %s',
    (value) => {
      mountRuntime();
      expect(() => rpx(value)).toThrow(/value/);
      expect(() => width(value)).toThrow(/ratio/);
      expect(() => height(value)).toThrow(/ratio/);
    },
  );

  it('Provider 未挂载时拒绝换算', () => {
    expect(() => rpx(24)).toThrow(/ResponsiveProvider/);
  });
});
