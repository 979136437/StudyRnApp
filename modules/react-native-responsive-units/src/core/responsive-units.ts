import {
  assertResponsiveValue,
  getResponsiveRuntime,
} from './responsive-runtime';

export function rpx(value: number): number {
  const designValue = assertResponsiveValue(value, 'value');
  const { designWidth, viewportWidth } = getResponsiveRuntime();
  return (designValue * viewportWidth) / designWidth;
}

function clampRatio(ratio: number): number {
  return Math.min(1, Math.max(0, assertResponsiveValue(ratio, 'ratio')));
}

export function width(ratio: number): number {
  return getResponsiveRuntime().viewportWidth * clampRatio(ratio);
}

export function height(ratio: number): number {
  return getResponsiveRuntime().viewportHeight * clampRatio(ratio);
}
