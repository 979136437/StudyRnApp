import type { HostComponent, ViewProps } from 'react-native';
import { codegenNativeComponent } from 'react-native';
import type {
  DirectEventHandler,
  Double,
  WithDefault,
} from 'react-native/Libraries/Types/CodegenTypes';

/**
 * 原生逐帧下拉事件。
 *
 * 该事件由 Fabric 直接交给 Reanimated 事件处理器，不经过 React state，
 * 因此拖拽期间不会每帧触发组件重新渲染。
 */
export type RefreshPullEvent = Readonly<{
  /** 当前下拉距离，单位为 dp/pt，包含超过触发阈值后的距离。 */
  offset: Double;
  /** `offset / threshold` 的钳制结果，范围为 `0...1`。 */
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
  /** 触发刷新的可见下拉阈值。 */
  threshold?: WithDefault<Double, 80>;
  /** 刷新中及结果态的内容保持高度。 */
  headerHeight?: WithDefault<Double, 80>;
  /** 原生内容允许下移的最大距离。 */
  limit?: WithDefault<Double, 160>;
  /** 可见下拉距离转换为触发进度时使用的灵敏度。 */
  dragRate?: WithDefault<Double, 1>;
  /** 连续位移事件；由 Reanimated 在界面线程消费。 */
  onPull?: DirectEventHandler<RefreshPullEvent>;
}

export default codegenNativeComponent<NativeProps>(
  'NitroRefreshControlView',
) as HostComponent<NativeProps>;
