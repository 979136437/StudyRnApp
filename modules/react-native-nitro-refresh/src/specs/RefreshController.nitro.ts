import type { HybridObject } from 'react-native-nitro-modules';

/**
 * 传输给 Nitrogen 的字符串联合。
 *
 * Nitrogen 会将其生成为 Kotlin/C++ 枚举和 Swift 枚举别名，但 JSI 边界仍使用
 * 稳定的字符串值，避免把原生枚举序号暴露给 JavaScript。
 */
export type RefreshPhase =
  | 'idle'
  | 'pulling'
  | 'ready'
  | 'refreshing'
  | 'success'
  | 'failure'
  | 'settling';

export type RefreshResult = 'success' | 'failure';

/** 原生刷新视图在同一时刻的只读快照。 */
export interface RefreshStateSnapshot {
  phase: RefreshPhase;
  offset: number;
  refreshing: boolean;
}

export interface RefreshController extends HybridObject<{
  ios: 'swift';
  android: 'kotlin';
}> {
  /** 将当前 HybridObject 与对应 Fabric 视图关联的稳定唯一标识。 */
  readonly id: string;

  /** 注册一次下拉刷新请求的离散回调。 */
  setOnRefresh(callback: () => void): void;
  /** 注册刷新状态机发生阶段变化时的离散回调。 */
  setOnStateChange(callback: (phase: RefreshPhase) => void): void;
  /** 清理 JS 回调及原生注册表引用；组件卸载时必须调用。 */
  clearCallbacks(): void;
  /** 程序化进入刷新，并像用户下拉一样请求一次业务刷新。 */
  beginRefresh(): void;
  /** 取消当前下拉、刷新、结果展示或回弹，并复位到空闲状态。 */
  cancelRefresh(): void;
  /** 从刷新中或程序化拉满状态显示结果，并在指定时长后自动收起。 */
  finishRefresh(refreshResult: RefreshResult, resultDuration: number): void;
  /** 同步读取原生视图最近一次发布的完整状态快照。 */
  getState(): RefreshStateSnapshot;
  /** 程序化拉到最大距离并停留在 ready，等待开始、取消或结果命令。 */
  pullToMax(): void;
  /** 将 React 的受控 `refreshing` 状态同步到原生刷新容器。 */
  setRefreshing(refreshing: boolean): void;
}
