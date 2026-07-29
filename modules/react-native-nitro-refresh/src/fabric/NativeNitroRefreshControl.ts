import type { HostComponent, ViewProps } from 'react-native';
import type {
  DirectEventHandler,
  Double,
  WithDefault,
} from 'react-native/Libraries/Types/CodegenTypes';
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';

/**
 * 原生逐帧下拉事件。
 *
 * 该事件由 Fabric 直接交给 Reanimated 事件处理器，不经过 React state，
 * 因此拖拽期间不会每帧触发组件重新渲染。
 */
export type RefreshPullEvent = Readonly<{
  /** 当前下拉距离，单位为 dp/pt，包含超过触发阈值后的距离。 */
  offset: Double;
  /** `offset / pullDistance` 的钳制结果，范围为 `0...1`。 */
  progress: Double;
  /** 当前原生阶段的字符串值，与 Nitro `RefreshPhase` 保持一致。 */
  phase: string;
}>;

/** 由 React Native Codegen 消费的隐藏 Fabric 刷新控件属性。 */
export interface NativeProps extends ViewProps {
  /** 用于将 Fabric 视图绑定到 Nitro HybridObject 的唯一标识。 */
  controllerId: string;
  /** 是否响应下拉手势。 */
  enabled?: WithDefault<boolean, true>;
  /** 触发阈值和刷新保持高度。 */
  pullDistance?: WithDefault<Double, 80>;
  /** 原生内容允许下移的最大距离。 */
  maxPullDistance?: WithDefault<Double, 160>;
  /** 原始手势距离转换为内容位移时使用的阻尼系数。 */
  dragRate?: WithDefault<Double, 0.5>;
  /** 连续位移事件；由 Reanimated 在界面线程消费。 */
  onPull?: DirectEventHandler<RefreshPullEvent>;
}

export default codegenNativeComponent<NativeProps>(
  'NitroRefreshControlView',
) as HostComponent<NativeProps>;
