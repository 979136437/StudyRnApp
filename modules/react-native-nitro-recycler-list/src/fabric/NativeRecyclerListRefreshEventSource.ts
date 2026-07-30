import type { HostComponent, ViewProps } from 'react-native';
import { codegenNativeComponent } from 'react-native';
import type {
  DirectEventHandler,
  Double,
} from 'react-native/Libraries/Types/CodegenTypes';

/** 原生列表逐帧发送给 Reanimated UI Runtime 的下拉数据。 */
export type RecyclerListRefreshPullEvent = Readonly<{
  /** 当前可见下拉距离，单位为 dp/pt，保留超过阈值后的距离。 */
  offset: Double;
  /** 相对于触发阈值的标准化进度，范围固定为 `0...1`。 */
  progress: Double;
  /** 当前原生刷新阶段的字符串值。 */
  phase: string;
}>;

/** 用于承载 Fabric 直接事件的零尺寸原生视图属性。 */
export interface NativeProps extends ViewProps {
  /** 与 Nitro 原生列表实例配对的稳定标识。 */
  listId: string;
  /** 原生下拉、保持及回弹期间连续发送的直接事件。 */
  onPull?: DirectEventHandler<RecyclerListRefreshPullEvent>;
}

export default codegenNativeComponent<NativeProps>(
  'RecyclerListRefreshEventSourceView',
) as HostComponent<NativeProps>;
