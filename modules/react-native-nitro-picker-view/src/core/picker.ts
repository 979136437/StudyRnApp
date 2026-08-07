import type { ReactElement, ReactNode } from 'react';
import { Children, isValidElement } from 'react';

import {
  DEFAULT_EDGE_FADE_INTENSITY,
  DEFAULT_EDGE_FADE_SIZE,
  DEFAULT_FONT_SIZE,
  DEFAULT_ITEM_HEIGHT,
  DEFAULT_MAGNIFICATION,
  MAXIMUM_EDGE_FADE_INTENSITY,
  MAXIMUM_EDGE_FADE_SIZE,
  MAXIMUM_FONT_SIZE,
  MAXIMUM_ITEM_HEIGHT,
  MAXIMUM_MAGNIFICATION,
  MINIMUM_EDGE_FADE_INTENSITY,
  MINIMUM_EDGE_FADE_SIZE,
  MINIMUM_FONT_SIZE,
  MINIMUM_ITEM_HEIGHT,
  MINIMUM_MAGNIFICATION,
} from '../constants';
import type { PickerViewColumnProps } from '../types';

export type PickerColumnElement = ReactElement<PickerViewColumnProps>;

export type NormalizedPickerOptions = Readonly<{
  disabled: boolean;
  edgeFadeIntensity: number;
  edgeFadeSize: number;
  fontSize: number;
  itemHeight: number;
  magnification: number;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteOrDefault(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function normalizePickerOptions(options: {
  disabled?: boolean;
  edgeFadeIntensity?: number;
  edgeFadeSize?: number;
  fontSize?: number;
  itemHeight?: number;
  magnification?: number;
}): NormalizedPickerOptions {
  return {
    disabled: options.disabled ?? false,
    edgeFadeIntensity: clamp(
      finiteOrDefault(options.edgeFadeIntensity, DEFAULT_EDGE_FADE_INTENSITY),
      MINIMUM_EDGE_FADE_INTENSITY,
      MAXIMUM_EDGE_FADE_INTENSITY,
    ),
    edgeFadeSize: clamp(
      finiteOrDefault(options.edgeFadeSize, DEFAULT_EDGE_FADE_SIZE),
      MINIMUM_EDGE_FADE_SIZE,
      MAXIMUM_EDGE_FADE_SIZE,
    ),
    fontSize: clamp(
      finiteOrDefault(options.fontSize, DEFAULT_FONT_SIZE),
      MINIMUM_FONT_SIZE,
      MAXIMUM_FONT_SIZE,
    ),
    itemHeight: clamp(
      finiteOrDefault(options.itemHeight, DEFAULT_ITEM_HEIGHT),
      MINIMUM_ITEM_HEIGHT,
      MAXIMUM_ITEM_HEIGHT,
    ),
    magnification: clamp(
      finiteOrDefault(options.magnification, DEFAULT_MAGNIFICATION),
      MINIMUM_MAGNIFICATION,
      MAXIMUM_MAGNIFICATION,
    ),
  };
}

export function normalizePickerValue(
  value: readonly number[] | undefined,
  columns: readonly (readonly string[])[],
): number[] {
  return columns.map((items, columnIndex) => {
    const candidate = value?.[columnIndex];
    const integer =
      typeof candidate === 'number' && Number.isFinite(candidate)
        ? Math.trunc(candidate)
        : 0;
    return items.length === 0 ? 0 : clamp(integer, 0, items.length - 1);
  });
}

export function extractTextItems(children: ReactNode): string[] {
  return Children.toArray(children).map((item) => {
    if (typeof item === 'string' || typeof item === 'number') {
      return String(item);
    }
    throw new TypeError(
      'PickerViewColumn only accepts string or number children.',
    );
  });
}

export function extractColumns(
  children: ReactNode,
  columnType: (props: PickerViewColumnProps) => null,
): string[][] {
  return Children.toArray(children).map((child) => {
    if (
      !isValidElement<PickerViewColumnProps>(child) ||
      child.type !== columnType
    ) {
      throw new TypeError('PickerView only accepts PickerViewColumn children.');
    }
    return extractTextItems(child.props.children);
  });
}

export function calculateRowAppearance(
  distanceFromCenter: number,
  itemHeight: number,
  magnification: number,
): Readonly<{ opacity: number; scale: number }> {
  const safeHeight = Math.max(1, itemHeight);
  const progress = clamp(
    1 - Math.abs(distanceFromCenter) / (safeHeight * 2),
    0,
    1,
  );
  // 平滑曲线避免项目越过中心线时缩放速度突然变化。
  const eased = progress * progress * (3 - 2 * progress);
  return {
    opacity: 0.45 + 0.55 * eased,
    scale: 1 + (magnification - 1) * eased,
  };
}
