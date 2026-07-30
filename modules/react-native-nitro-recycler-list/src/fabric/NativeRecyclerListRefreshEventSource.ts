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
  /** 第一阈值至第二阈值之间的标准化进度，范围固定为 `0...1`。 */
  secondLevelProgress: Double;
  /** 当前原生下拉二级阶段。 */
  secondLevelPhase: string;
}>;

/** 活动列表向折叠 Tab 共享头发送的直接滚动事件。 */
export type RecyclerListTabScrollEvent = Readonly<{
  /** 共享头当前折叠距离，单位为 dp/pt。 */
  collapseOffset: Double;
}>;

/** 用于承载 Fabric 直接事件的零尺寸原生视图属性。 */
export interface NativeProps extends ViewProps {
  /** 与 Nitro 原生列表实例配对的稳定标识。 */
  listId: string;
  /** 原生下拉、保持及回弹期间连续发送的直接事件。 */
  onPull?: DirectEventHandler<RecyclerListRefreshPullEvent>;
  /** 活动 Tab 列表滚动时连续发送的共享头折叠距离。 */
  onTabScroll?: DirectEventHandler<RecyclerListTabScrollEvent>;
}

export default codegenNativeComponent<NativeProps>(
  'RecyclerListRefreshEventSourceView',
) as HostComponent<NativeProps>;
