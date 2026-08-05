import { DEFAULT_REFRESH_HEADER_HEIGHT } from '../constants';
import type { RefreshPhase } from '../specs/RefreshController.nitro';
import { RefreshState, type RefreshStateCallback } from '../types';

export interface RefreshStateCallbacks {
  onIdle?: RefreshStateCallback;
  onPulling?: RefreshStateCallback;
  onMax?: RefreshStateCallback;
  onRefreshing?: RefreshStateCallback;
  onEnd?: RefreshStateCallback;
}

/**
 * 将原生内部五阶段压缩为公共四阶段。
 *
 * `settling` 是否属于 End 取决于它之前是否真正刷新过：不足阈值松手和取消拖动
 * 都会经过内部 settling，但公共状态必须继续保持 Idle；刷新完成后的 settling 才是
 * End。previousState 保存了这项无法从单个内部枚举推断的上下文。
 */
export function reduceRefreshState(
  previousState: RefreshState,
  phase: RefreshPhase,
): RefreshState {
  switch (phase) {
    case 'ready':
      // Max 由 Fabric 位移事件派生；晚到的同阶段 Nitro 通知不能把它降回 Pulling。
      return previousState === RefreshState.Max
        ? RefreshState.Max
        : RefreshState.Pulling;
    case 'refreshing':
      return RefreshState.Refreshing;
    case 'settling':
      return previousState === RefreshState.Refreshing ||
        previousState === RefreshState.End
        ? RefreshState.End
        : RefreshState.Idle;
    case 'idle':
    case 'pulling':
      return RefreshState.Idle;
  }
}

/** 根据状态选择对应回调，集中维护公共状态与回调名称的一一映射。 */
export function callbackForRefreshState(
  callbacks: RefreshStateCallbacks,
  state: RefreshState,
): RefreshStateCallback | undefined {
  switch (state) {
    case RefreshState.Idle:
      return callbacks.onIdle;
    case RefreshState.Pulling:
      return callbacks.onPulling;
    case RefreshState.Refreshing:
      return callbacks.onRefreshing;
    case RefreshState.End:
      return callbacks.onEnd;
    case RefreshState.Max:
      return callbacks.onMax;
  }
}

/**
 * 保存最近一次已发布的公共状态，并保证同一阶段的原生重复通知只触发一次回调。
 * 回调对象可在每次 React 渲染后替换，因此不会捕获过期闭包。
 */
export class RefreshStateCoordinator {
  private state: RefreshState = RefreshState.Idle;
  private callbacks: RefreshStateCallbacks;

  constructor(callbacks: RefreshStateCallbacks = {}) {
    this.callbacks = callbacks;
  }

  updateCallbacks(callbacks: RefreshStateCallbacks): void {
    this.callbacks = callbacks;
  }

  accept(phase: RefreshPhase): RefreshState | undefined {
    const nextState = reduceRefreshState(this.state, phase);
    return this.acceptState(nextState);
  }

  /** 发布由 TypeScript 位移层派生的状态，例如达到或离开二级下拉阈值。 */
  acceptState(nextState: RefreshState): RefreshState | undefined {
    if (nextState === this.state) {
      return undefined;
    }

    this.state = nextState;
    callbackForRefreshState(this.callbacks, nextState)?.(nextState);
    return nextState;
  }

  current(): RefreshState {
    return this.state;
  }
}

/**
 * 计算应同步给原生层的受控值。undefined 表示属性重复，无需再次下发；force 用于
 * 用户松手触发刷新后强制核对父组件是否把 refreshing 置为 true。
 */
export class ControlledRefreshCoordinator {
  private lastValue: boolean | undefined;

  next(
    enable: boolean,
    refreshing: boolean,
    force = false,
  ): boolean | undefined {
    const value = enable && refreshing;
    if (!force && value === this.lastValue) {
      return undefined;
    }
    this.lastValue = value;
    return value;
  }
}

/**
 * 校验刷新头的固定高度。StyleSheet.flatten 的结果会传入这里，使该函数无需加载
 * React Native 运行时即可进行纯 TypeScript 测试。
 */
export function resolveRefreshHeaderHeight(
  height: unknown,
  warn?: (message: string) => void,
): number {
  if (typeof height === 'number' && Number.isFinite(height) && height > 0) {
    return height;
  }

  warn?.(
    `[react-native-nitro-refresh] RefreshHeader 的 style.height 必须是大于 0 的固定数值，已回退为 ${DEFAULT_REFRESH_HEADER_HEIGHT}。`,
  );
  return DEFAULT_REFRESH_HEADER_HEIGHT;
}

/**
 * 校验刷新头允许展示的最大下拉距离。未提供时默认等于触发阈值；显式配置不能小于
 * 阈值，否则原生层会在达到刷新条件前先停止位移，造成配置语义不明确。
 */
export function resolveRefreshMaxDistance(
  maxDistance: unknown,
  threshold: number,
  warn?: (message: string) => void,
): number {
  if (maxDistance === undefined) {
    return threshold;
  }

  if (
    typeof maxDistance === 'number' &&
    Number.isFinite(maxDistance) &&
    maxDistance >= threshold
  ) {
    return maxDistance;
  }

  warn?.(
    `[react-native-nitro-refresh] maxDistance 必须是大于或等于刷新阈值 ${threshold} 的有限数值，已回退为 ${threshold}。`,
  );
  return threshold;
}

/**
 * 二级状态是显式选择加入的能力。未传 maxDistance 时，即使解析后的原生最大距离与
 * 第一阈值相同，也不能发布 Max 或调用 onMax。
 */
export function isMaxStageEnabled(
  maxDistance: unknown,
  threshold: number,
): maxDistance is number {
  return (
    typeof maxDistance === 'number' &&
    Number.isFinite(maxDistance) &&
    maxDistance > threshold
  );
}

/** 受控刷新在禁用时永远不能进入原生刷新态。 */
export function resolveControlledRefreshing(
  enable: boolean,
  refreshing: boolean,
): boolean {
  return enable && refreshing;
}
