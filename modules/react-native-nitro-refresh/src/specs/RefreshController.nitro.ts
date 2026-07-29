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
  | 'settling';

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
  /** 将 React 的受控 `refreshing` 状态同步到原生刷新容器。 */
  setRefreshing(refreshing: boolean): void;
}
