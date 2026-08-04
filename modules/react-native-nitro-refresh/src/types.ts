import type { ReactElement, ReactNode } from 'react';
import type {
  NativeSyntheticEvent,
  StyleProp,
  ViewProps,
  ViewStyle,
} from 'react-native';

/**
 * 与上游组件一致的四阶段刷新状态。
 *
 * 数值保持稳定，调用方可以直接用于 switch、日志或轻量状态存储。内部 Nitro
 * 七阶段不会从公共入口泄漏。
 */
export const RefreshState = {
  /** 未达到触发阈值，或回弹已经完成。 */
  Idle: 0,
  /** 已达到触发阈值，松手将进入刷新。 */
  Pulling: 1,
  /** 正在刷新，等待受控属性切换为 false。 */
  Refreshing: 2,
  /** 刷新已经结束，内容正在回弹。 */
  End: 3,
} as const;

/** `RefreshState` 运行时对象中所有值组成的数值字面量联合。 */
export type RefreshState = (typeof RefreshState)[keyof typeof RefreshState];

/** `onChangeOffset` 的原生事件负载，offset 单位为 dp/pt。 */
export interface RefreshOffsetNativeEvent {
  offset: number;
}

/** 与 React Native 原生事件形状一致的刷新位移事件。 */
export type RefreshOffsetEvent = NativeSyntheticEvent<RefreshOffsetNativeEvent>;

/** 四阶段回调的统一签名。 */
export type RefreshStateCallback = (state: RefreshState) => void;

/** `RefreshHeader` 的公开属性。 */
export interface RefreshHeaderProps extends Omit<ViewProps, 'style'> {
  /**
   * 刷新头样式。height 必须是大于 0 的固定数值；百分比、flex 推导值和非法数值
   * 会在开发环境警告，并回退到 80。
   */
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/** `RefreshLayout` 的公开属性。 */
export interface RefreshLayoutProps extends Omit<ViewProps, 'children'> {
  /** 是否允许用户下拉；禁用时会取消当前动作并恢复空闲状态，默认为 true。 */
  enable?: boolean;
  /**
   * 受控刷新状态。从 false 切换为 true 会程序化展开并进入刷新；从 true 切换为
   * false 会进入 End，随后回弹到 Idle。
   */
  refreshing: boolean;
  /** 自定义刷新头。必须是一个 `RefreshHeader` 元素。 */
  header: ReactElement<RefreshHeaderProps>;
  /** 未达到阈值或回弹完成并进入 Idle 时调用。 */
  onIdle?: RefreshStateCallback;
  /** 达到阈值并进入 Pulling 时调用。 */
  onPulling?: RefreshStateCallback;
  /** 用户松手或程序化启动并进入 Refreshing 时调用。 */
  onRefreshing?: RefreshStateCallback;
  /** 受控 refreshing 结束并进入回弹阶段时调用。 */
  onEnd?: RefreshStateCallback;
  /** 高频位移事件；仅提供此回调时才从界面线程调度到 JavaScript。 */
  onChangeOffset?: (event: RefreshOffsetEvent) => void;
  /** Android 由 React Native 自动注入的纵向滚动组件。 */
  children?: ReactElement | null;
}
