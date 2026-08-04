import { createElement, type ComponentType } from 'react';
import { describe, expect, it } from 'vitest';

import type { RefreshHeaderProps } from '../../types';
import { identifyRefreshChildren, REFRESH_HEADER_MARKER } from '../children';

function HeaderForTest(): null {
  return null;
}
Object.assign(HeaderForTest, { [REFRESH_HEADER_MARKER]: true as const });

interface ScrollableForTestProps {
  horizontal?: boolean;
  inverted?: boolean;
}

function ScrollableForTest(_props: ScrollableForTestProps): null {
  return null;
}

const header = createElement(
  HeaderForTest as ComponentType<RefreshHeaderProps>,
  { style: { height: 80 } },
);

describe('identifyRefreshChildren', () => {
  it('识别一个 Header 和一个纵向非倒置滚动组件', () => {
    const scrollable = createElement(ScrollableForTest);
    const result = identifyRefreshChildren(header, scrollable);
    expect(result.header).toBe(header);
    expect(result.scrollable?.type).toBe(ScrollableForTest);
    expect(result.scrollable?.props).toEqual({});
  });

  it('iOS 未注入滚动子组件时仍保留 Header', () => {
    expect(identifyRefreshChildren(header, null)).toEqual({
      header,
      scrollable: null,
    });
  });

  it('拒绝非 RefreshHeader 元素', () => {
    expect(() => identifyRefreshChildren(createElement('div'), null)).toThrow(
      'header 必须是一个 RefreshHeader',
    );
  });

  it('拒绝多个滚动子组件', () => {
    expect(() =>
      identifyRefreshChildren(header, [
        createElement(ScrollableForTest, { key: 'first' }),
        createElement(ScrollableForTest, { key: 'second' }),
      ]),
    ).toThrow('只支持一个纵向滚动子组件');
  });

  it.each([{ horizontal: true }, { inverted: true }])(
    '拒绝不支持的滚动属性 %o',
    (props) => {
      expect(() =>
        identifyRefreshChildren(
          header,
          createElement(ScrollableForTest, props as ScrollableForTestProps),
        ),
      ).toThrow('不支持');
    },
  );
});
