import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';

import type { RefreshHeaderProps } from '../types';

export const REFRESH_HEADER_MARKER = Symbol.for(
  'react-native-nitro-refresh.RefreshHeader',
);

type MarkedComponent = {
  [REFRESH_HEADER_MARKER]?: true;
};

type ScrollableProps = {
  horizontal?: boolean | null;
  inverted?: boolean | null;
};

export interface RefreshChildren {
  header: ReactElement<RefreshHeaderProps>;
  scrollable: ReactElement<ScrollableProps> | null;
}

/** 不依赖组件函数名称判断 Header，避免生产压缩和 React Compiler 改名造成误判。 */
export function isRefreshHeaderElement(
  child: ReactNode,
): child is ReactElement<RefreshHeaderProps> {
  return (
    isValidElement(child) &&
    typeof child.type !== 'string' &&
    (child.type as MarkedComponent)[REFRESH_HEADER_MARKER] === true
  );
}

/**
 * 识别一个显式 Header 和 React Native 在 Android 注入的一个滚动组件。
 * 额外元素会直接报错，防止原生 ViewGroup 因子节点顺序不确定而绑定错误内容。
 */
export function identifyRefreshChildren(
  header: ReactNode,
  children: ReactNode,
): RefreshChildren {
  if (!isRefreshHeaderElement(header)) {
    throw new Error('RefreshLayout 的 header 必须是一个 RefreshHeader 元素。');
  }

  const elements = Children.toArray(children).filter(isValidElement);
  if (elements.length > 1) {
    throw new Error('RefreshLayout 只支持一个纵向滚动子组件。');
  }

  const scrollable =
    (elements[0] as ReactElement<ScrollableProps> | undefined) ?? null;
  if (scrollable?.props.horizontal) {
    throw new Error('RefreshLayout 不支持横向滚动组件。');
  }
  if (scrollable?.props.inverted) {
    throw new Error('RefreshLayout 不支持 inverted 滚动组件。');
  }

  return { header, scrollable };
}
