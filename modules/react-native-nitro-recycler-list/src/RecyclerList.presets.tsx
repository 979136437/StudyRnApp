import { forwardRef, type ReactElement } from 'react';

import { RecyclerList } from './RecyclerList';
import type {
  RecyclerListProps,
  RecyclerListRef,
  SecondLevelOptions,
} from './types';

/** 固定为规则网格布局的回收列表属性。 */
export type RecyclerGridListProps<T> = Omit<
  RecyclerListProps<T>,
  'horizontal' | 'layout'
>;

/** 固定为瀑布流布局的回收列表属性。 */
export type RecyclerMasonryListProps<T> = Omit<
  RecyclerListProps<T>,
  'horizontal' | 'layout'
>;

/**
 * 横向回收列表属性。
 *
 * 横向列表固定使用普通线性布局，并移除只对纵向布局有效的刷新、二楼、跨列和
 * 吸顶属性。
 */
export type RecyclerHorizontalListProps<T> = Omit<
  RecyclerListProps<T>,
  | 'getItemSpan'
  | 'getStickyGroup'
  | 'getStickyLevel'
  | 'horizontal'
  | 'layout'
  | 'numColumns'
  | 'onRefresh'
  | 'refreshEnabled'
  | 'refreshThreshold'
  | 'refreshing'
  | 'renderRefreshHeader'
  | 'secondLevel'
>;

/** 至少声明一个吸顶层级的回收列表属性。 */
export type RecyclerStickyListProps<T> = Omit<
  RecyclerListProps<T>,
  'getStickyLevel' | 'horizontal'
> & {
  /** 返回项目的吸顶层级；普通项目返回 `undefined`。 */
  getStickyLevel: NonNullable<RecyclerListProps<T>['getStickyLevel']>;
};

/** 同时声明吸顶层级和排斥组键的回收列表属性。 */
export type RecyclerGroupedStickyListProps<T> = Omit<
  RecyclerListProps<T>,
  'getStickyGroup' | 'getStickyLevel' | 'horizontal'
> & {
  /** 返回吸顶项目所属的稳定组键；普通项目可以返回 `undefined`。 */
  getStickyGroup: NonNullable<RecyclerListProps<T>['getStickyGroup']>;
  /** 返回项目的吸顶层级；普通项目返回 `undefined`。 */
  getStickyLevel: NonNullable<RecyclerListProps<T>['getStickyLevel']>;
};

/** 固定启用受控下拉二级能力的纵向回收列表属性。 */
export type RecyclerSecondLevelListProps<T> = Omit<
  RecyclerListProps<T>,
  'horizontal' | 'secondLevel'
> & {
  /** 二楼受控状态、阈值、回调和内容渲染配置。 */
  secondLevel: SecondLevelOptions;
};

function RecyclerGridListInner<T>(
  props: RecyclerGridListProps<T>,
  ref: React.ForwardedRef<RecyclerListRef>,
): ReactElement {
  return <RecyclerList {...props} horizontal={false} layout="grid" ref={ref} />;
}

function RecyclerMasonryListInner<T>(
  props: RecyclerMasonryListProps<T>,
  ref: React.ForwardedRef<RecyclerListRef>,
): ReactElement {
  return (
    <RecyclerList {...props} horizontal={false} layout="masonry" ref={ref} />
  );
}

function RecyclerHorizontalListInner<T>(
  props: RecyclerHorizontalListProps<T>,
  ref: React.ForwardedRef<RecyclerListRef>,
): ReactElement {
  return <RecyclerList {...props} horizontal layout="list" ref={ref} />;
}

function RecyclerStickyListInner<T>(
  props: RecyclerStickyListProps<T>,
  ref: React.ForwardedRef<RecyclerListRef>,
): ReactElement {
  return <RecyclerList {...props} horizontal={false} ref={ref} />;
}

function RecyclerGroupedStickyListInner<T>(
  props: RecyclerGroupedStickyListProps<T>,
  ref: React.ForwardedRef<RecyclerListRef>,
): ReactElement {
  return <RecyclerList {...props} horizontal={false} ref={ref} />;
}

function RecyclerSecondLevelListInner<T>(
  props: RecyclerSecondLevelListProps<T>,
  ref: React.ForwardedRef<RecyclerListRef>,
): ReactElement {
  return <RecyclerList {...props} horizontal={false} ref={ref} />;
}

/** 规则网格回收列表，固定使用 `layout="grid"`。 */
export const RecyclerGridList = forwardRef(RecyclerGridListInner) as <T>(
  props: RecyclerGridListProps<T> & { ref?: React.Ref<RecyclerListRef> },
) => ReactElement;

/** 动态高度瀑布流，固定使用 `layout="masonry"`。 */
export const RecyclerMasonryList = forwardRef(RecyclerMasonryListInner) as <T>(
  props: RecyclerMasonryListProps<T> & { ref?: React.Ref<RecyclerListRef> },
) => ReactElement;

/** 用于纵向主列表内嵌场景的横向线性回收列表。 */
export const RecyclerHorizontalList = forwardRef(
  RecyclerHorizontalListInner,
) as <T>(
  props: RecyclerHorizontalListProps<T> & { ref?: React.Ref<RecyclerListRef> },
) => ReactElement;

/** 要求显式提供吸顶层级的回收列表。 */
export const RecyclerStickyList = forwardRef(RecyclerStickyListInner) as <T>(
  props: RecyclerStickyListProps<T> & { ref?: React.Ref<RecyclerListRef> },
) => ReactElement;

/** 要求显式提供吸顶层级和组键的分组排斥吸顶列表。 */
export const RecyclerGroupedStickyList = forwardRef(
  RecyclerGroupedStickyListInner,
) as <T>(
  props: RecyclerGroupedStickyListProps<T> & {
    ref?: React.Ref<RecyclerListRef>;
  },
) => ReactElement;

/** 要求显式提供受控二楼配置的纵向回收列表。 */
export const RecyclerSecondLevelList = forwardRef(
  RecyclerSecondLevelListInner,
) as <T>(
  props: RecyclerSecondLevelListProps<T> & { ref?: React.Ref<RecyclerListRef> },
) => ReactElement;
