import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import type {
  RefreshPhase as NativeRefreshPhase,
  RefreshResult as NativeRefreshResult,
  RefreshStateSnapshot as NativeRefreshStateSnapshot,
} from './specs/RefreshController.nitro';

/**
 * 刷新状态的运行时常量。
 *
 * Nitro 规格使用字符串联合生成原生枚举，而公共 API 同时导出这个对象，
 * 使业务代码既可以使用 `RefreshPhase.REFRESHING`，也可以直接与
 * `'refreshing'` 比较。`satisfies` 约束确保这里的键和值与 Nitro 规格一致。
 */
export const RefreshPhase = {
  /** 未发生下拉，刷新头完全收起。 */
  IDLE: 'idle',
  /** 正在下拉，但尚未达到触发阈值。 */
  PULLING: 'pulling',
  /** 已达到触发阈值，松手后将开始刷新。 */
  READY: 'ready',
  /** 刷新已触发，等待外部把 `refreshing` 设置为 `false`。 */
  REFRESHING: 'refreshing',
  /** 刷新成功，正在展示结果。 */
  SUCCESS: 'success',
  /** 刷新失败，正在展示结果。 */
  FAILURE: 'failure',
  /** 正在恢复内容位置，结束后进入 `idle`。 */
  SETTLING: 'settling',
} as const satisfies Record<Uppercase<NativeRefreshPhase>, NativeRefreshPhase>;

/** `RefreshPhase` 运行时对象中所有值组成的字符串字面量联合。 */
export type RefreshPhase = (typeof RefreshPhase)[keyof typeof RefreshPhase];

/** 命令式结束刷新时可使用的结果常量。 */
export const RefreshResult = {
  SUCCESS: 'success',
  FAILURE: 'failure',
} as const satisfies Record<
  Uppercase<NativeRefreshResult>,
  NativeRefreshResult
>;

/** `RefreshResult` 运行时对象中所有值组成的字符串字面量联合。 */
export type RefreshResult = (typeof RefreshResult)[keyof typeof RefreshResult];

/** 原生刷新视图在同一时刻的只读状态快照。 */
export type RefreshStateSnapshot = NativeRefreshStateSnapshot;

/** `RefreshControl` 通过 ref 暴露的命令式控制接口。 */
export interface RefreshControlRef {
  /** 程序化进入刷新，并触发一次 `onRefresh`。 */
  beginRefresh(): void;
  /** 取消当前动作，不展示成功或失败结果。 */
  cancelRefresh(): void;
  /** 从刷新中或程序化拉满状态显示成功或失败结果，并随后自动收起。 */
  finishRefresh(result: RefreshResult): void;
  /** 同步读取原生视图最近一次发布的完整状态。 */
  getState(): RefreshStateSnapshot;
  /** 动画拉至 `limit` 并停留，等待开始、取消或结果命令。 */
  pullToMax(): void;
}

/** 传递给自定义刷新头的状态与界面线程动画数据。 */
export interface RefreshHeaderContext {
  /**
   * 离散的 React 状态。
   *
   * 仅在阶段变化时更新，适合切换文字、图标或刷新中状态；不要用它驱动
   * 需要逐帧连续变化的动画，否则会引起不必要的 React 渲染。
   */
  phase: RefreshPhase;
  /** `phase` 的 Reanimated SharedValue 版本，可在 worklet 中直接读取。 */
  phaseValue: SharedValue<RefreshPhase>;
  /**
   * 当前下拉位移，单位为 dp/pt。
   *
   * 该值保留阈值之外的超拉距离，范围为 `0...limit`。
   */
  offset: SharedValue<number>;
  /**
   * 相对于触发阈值的标准化进度，始终限制在 `0...1`。
   * 如需表现超过阈值后的超拉效果，应读取 `offset`。
   */
  progress: SharedValue<number>;
  /** 当前生效的刷新触发阈值，单位为 dp/pt。 */
  threshold: number;
}

/** `RefreshControl` 的公共属性。 */
export interface RefreshControlProps {
  /**
   * 受控刷新状态。
   *
   * `true` 会以编程方式进入或维持刷新；只有父组件传入 `false` 才会结束刷新。
   */
  refreshing: boolean;
  /** 用户下拉超过阈值并松手时调用。回调内应尽快把 `refreshing` 设置为 `true`。 */
  onRefresh: () => void;
  /** 自定义刷新头渲染函数；省略时使用内置的简洁刷新头。 */
  renderHeader?: (context: RefreshHeaderContext) => ReactNode;
  /** 是否允许下拉刷新。禁用时会立即结束刷新并复位内容，默认为 `true`。 */
  enabled?: boolean;
  /** 触发刷新的可见下拉阈值，单位为 dp/pt，默认 `80`。 */
  threshold?: number;
  /** 允许下拉的最大距离，单位为 dp/pt，默认 `threshold * 2`。 */
  limit?: number;
  /** 下拉触发灵敏度，范围为 `(0, 1]`，默认 `1`；值越小需要拖动越远。 */
  dragRate?: number;
  /** 成功或失败结果的停留时长，单位为毫秒，默认 `800`；设为 `0` 时立即回弹。 */
  timeout?: number;
  /** 刷新控件宿主样式；通常由滚动组件自动注入。 */
  style?: StyleProp<ViewStyle>;
  /** 离散阶段发生变化时调用；逐帧动画请使用刷新头上下文中的 SharedValue。 */
  onStateChange?: (phase: RefreshPhase) => void;
}
