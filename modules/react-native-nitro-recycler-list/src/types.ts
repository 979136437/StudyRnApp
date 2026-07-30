import type { ReactElement, ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import type {
  NativeRefreshPhase as NativeRefreshPhaseValue,
  NativeSecondLevelPhase as NativeSecondLevelPhaseValue,
  RecyclerLayout,
  RecyclerListState,
  VisibleRange,
} from './specs/RecyclerList.nitro';

/** 触底加载状态的运行时常量。 */
export const LoadMoreState = {
  /** 当前可以继续触发触底加载。 */
  IDLE: 'idle',
  /** 正在加载下一批数据，期间不会重复触发 `onEndReached`。 */
  LOADING: 'loading',
  /** 上一次加载失败，可通过 `retryEndReached()` 重新触发。 */
  ERROR: 'error',
  /** 数据已经全部加载完成，不再触发 `onEndReached`。 */
  FINISHED: 'finished',
} as const;

/** `LoadMoreState` 运行时对象中所有值组成的字符串字面量联合。 */
export type LoadMoreState = (typeof LoadMoreState)[keyof typeof LoadMoreState];

/** 原生下拉刷新阶段的运行时常量。 */
export const NativeRefreshPhase = {
  /** 未发生下拉，刷新头完全收起。 */
  IDLE: 'idle',
  /** 正在下拉，但尚未达到刷新阈值。 */
  PULLING: 'pulling',
  /** 已达到刷新阈值，松手后将触发刷新。 */
  READY: 'ready',
  /** 刷新已触发，等待外部把 `refreshing` 设置为 `false`。 */
  REFRESHING: 'refreshing',
  /** 正在回弹并收起刷新头，结束后进入 `idle`。 */
  SETTLING: 'settling',
} as const satisfies Record<
  Uppercase<NativeRefreshPhaseValue>,
  NativeRefreshPhaseValue
>;

/** `NativeRefreshPhase` 运行时对象中所有值组成的字符串字面量联合。 */
export type NativeRefreshPhase =
  (typeof NativeRefreshPhase)[keyof typeof NativeRefreshPhase];

/**
 * 自定义刷新头接收的刷新阶段。
 *
 * 这是 `NativeRefreshPhase` 的公共别名，用于避免业务组件依赖原生规格文件。
 */
export type RefreshPhase = NativeRefreshPhase;

/** 下拉二级阶段的运行时常量。 */
export const SecondLevelPhase = {
  /** 未进入第二段下拉，二楼完全关闭。 */
  IDLE: 'idle',
  /** 已超过刷新阈值，正在向二楼阈值继续下拉。 */
  PULLING: 'pulling',
  /** 已达到二楼阈值，松手将请求打开二楼。 */
  READY: 'ready',
  /** 列表正在离开视口并显示二楼内容。 */
  OPENING: 'opening',
  /** 二楼已完全打开并允许交互。 */
  OPEN: 'open',
  /** 二楼正在关闭，列表返回初始位置。 */
  CLOSING: 'closing',
} as const satisfies Record<
  Uppercase<NativeSecondLevelPhaseValue>,
  NativeSecondLevelPhaseValue
>;

/** `SecondLevelPhase` 运行时对象中所有值组成的字符串字面量联合。 */
export type SecondLevelPhase =
  (typeof SecondLevelPhase)[keyof typeof SecondLevelPhase];

/** 刷新头读取的第二段下拉手势上下文。 */
export interface SecondLevelGestureContext {
  /** 当前二楼阶段，用于切换离散提示内容。 */
  phase: SecondLevelPhase;
  /** 当前二楼阶段的 UI Runtime 共享值。 */
  phaseValue: SharedValue<SecondLevelPhase>;
  /** 第一阈值至第二阈值之间的标准化进度。 */
  progress: SharedValue<number>;
  /** 当前二楼触发距离，单位为逻辑像素。 */
  threshold: number;
}

/** `renderContent` 渲染全屏二楼时接收的上下文。 */
export interface SecondLevelContentContext extends SecondLevelGestureContext {
  /** 当前原生下拉或开关动画的可见位移。 */
  offset: SharedValue<number>;
  /** 请求业务将受控 `open` 更新为 `false`。 */
  close(): void;
}

/** 受控下拉二级功能配置。 */
export interface SecondLevelOptions {
  /** 二楼是否应保持打开；业务必须在 `onOpenChange` 中同步该值。 */
  open: boolean;
  /** 原生请求打开或内容请求关闭时调用。 */
  onOpenChange(open: boolean): void;
  /** 用户达到第二阈值并松手时额外调用，不在程序化打开时调用。 */
  onRequested?: () => void;
  /** 渲染列表背后的全屏二楼内容。 */
  renderContent(context: SecondLevelContentContext): ReactNode;
  /** 二楼触发距离，必须大于 `refreshThreshold`。 */
  threshold?: number;
  /** 是否接受二楼手势，默认值为 `true`。 */
  enabled?: boolean;
}

/** `renderItem` 渲染单个回收槽位时接收的上下文。 */
export interface RecyclerRenderItemInfo<T> {
  /** 当前槽位绑定的数据项。 */
  item: T;

  /** 当前数据项在最新 `data` 中的零基索引。数据更新后可能发生变化。 */
  index: number;

  /** `keyExtractor` 为当前数据项生成的稳定键。 */
  itemKey: string;

  /** `getItemType` 为当前数据项生成的回收类型。 */
  itemType: string;
}

/** `renderRefreshHeader` 渲染自定义刷新头时接收的上下文。 */
export interface RefreshHeaderContext {
  /** 当前刷新阶段，用于切换提示文字、图标等离散界面状态。 */
  phase: RefreshPhase;

  /** `phase` 的 Reanimated `SharedValue` 版本，可在 worklet 中直接读取。 */
  phaseValue: SharedValue<RefreshPhase>;

  /**
   * 当前下拉进度对应的 Reanimated `SharedValue`。
   *
   * `0` 表示未下拉，`1` 表示达到或超过 `threshold`，值始终限制在 `0...1`。
   * 该值会原地更新，适合通过 `useAnimatedStyle` 驱动连续动画；渲染方不应修改
   * 或替换它。
   */
  progress: SharedValue<number>;

  /**
   * 当前刷新头可见位移对应的 Reanimated `SharedValue`，单位为逻辑像素。
   *
   * 该值保留超过阈值后的过拉距离，适合驱动刷新头的平移、缩放或透明度动画。
   */
  offset: SharedValue<number>;

  /** 当前生效的刷新触发距离，单位为逻辑像素。 */
  threshold: number;

  /** 启用下拉二级时提供第二段进度与阶段，否则为 `null`。 */
  secondLevel: SecondLevelGestureContext | null;
}

/** `renderLoadMoreFooter` 渲染加载尾部时接收的上下文。 */
export interface LoadMoreFooterContext {
  /** 当前受控加载状态。 */
  state: LoadMoreState;

  /**
   * 请求重新执行触底回调。
   *
   * 主要用于 `error` 状态下的重试按钮。列表仍会根据当前数据版本和加载状态进行
   * 去重，因此调用方应先确保状态允许重试。
   */
  retry: () => void;
}

/**
 * 原生回收列表的公共属性。
 *
 * 列表仅为当前可视区域及预加载区域创建有限数量的原生宿主。宿主滚出保留区域后会
 * 进入按元素类型划分的回收池，并在绑定到其他数据时复用。为避免局部状态串项，
 * 宿主绑定的新数据键发生变化时，其内部 React 子树会重新挂载。
 */
export interface RecyclerListProps<T> {
  /**
   * 列表数据源。
   *
   * 支持只读数组。插入、删除、移动和追加数据时，列表通过 `keyExtractor` 返回的
   * 稳定键计算差异，因此不应直接修改原数组中的元素顺序后继续复用同一引用。
   */
  data: readonly T[];

  /**
   * 渲染一条数据对应的 React 内容。
   *
   * 只有原生层请求的回收槽位会调用此函数。`itemKey` 是当前数据的稳定键，
   * `itemType` 是当前回收池类型；同一个原生宿主之后可能绑定到其他数据。
   */
  renderItem: (info: RecyclerRenderItemInfo<T>) => ReactElement | null;

  /**
   * 返回每条数据唯一且稳定的字符串键。
   *
   * 键用于数据差异更新、尺寸缓存、滚动锚点和 React 子树状态隔离。不同数据不能
   * 返回相同键；开发环境发现重复键时会直接抛出错误。
   */
  keyExtractor: (item: T, index: number) => string;

  /**
   * 返回元素对应的回收类型，默认值为 `default`。
   *
   * 原生宿主只会在相同类型之间复用。布局结构明显不同的元素应返回不同类型，
   * 例如文章卡片、图片卡片和分组标题，避免复用后产生不必要的布局重建。
   */
  getItemType?: (item: T, index: number) => string | number;

  /**
   * 尚未完成真实测量时使用的元素主轴预估尺寸，单位为逻辑像素，默认值为 `100`。
   *
   * 纵向列表表示高度，横向列表表示宽度。数值越接近真实尺寸，首次布局、快速滚动
   * 和 `scrollToIndex` 越稳定；内容完成布局后会使用实测尺寸更新缓存。
   */
  estimatedItemSize?: number;

  /**
   * 列表布局模式，默认值为 `list`。
   *
   * - `list`：单列线性列表。
   * - `grid`：按行排列的规则网格，允许元素跨列。
   * - `masonry`：动态高度瀑布流，按数据顺序放入当前最短列。
   */
  layout?: RecyclerLayout;

  /**
   * 网格或瀑布流的列数，默认值为 `2`。
   *
   * `layout="list"` 时固定按一列处理。有效值会被限制为 `1` 至 `64` 之间的整数。
   */
  numColumns?: number;

  /**
   * 返回元素在网格或瀑布流中占用的列数，默认值为 `1`。
   *
   * 返回值会限制在 `1...numColumns`。吸顶项必须占满所有列，否则开发环境会抛出
   * 错误。在线性列表中该返回值会被忽略。
   */
  getItemSpan?: (item: T, index: number) => number;

  /**
   * 是否启用横向滚动，默认值为 `false`。
   *
   * 首版横向模式仅支持 `layout="list"`，主要用于纵向主列表中嵌套横向列表。
   * 横向网格和横向瀑布流会被拒绝。
   */
  horizontal?: boolean;

  /**
   * 列表实例的稳定标识。
   *
   * 用于保存和恢复嵌套列表的滚动位置。父列表回收横向子列表时，应为每个子列表
   * 提供不同且跨渲染保持稳定的键，例如 `gallery-${item.id}`。省略时会为当前挂载
   * 实例生成临时标识，卸载后不会恢复位置。
   */
  listKey?: string;

  /**
   * 是否在卸载时保存 `listKey` 对应的滚动位置，并在重新挂载时恢复。
   *
   * 默认值为 `true`。只有同时提供稳定的 `listKey` 时才会生效。
   */
  preserveNestedScrollPosition?: boolean;

  /**
   * 返回元素的吸顶层级；返回 `undefined` 表示普通元素。
   *
   * 层级从 `0` 开始。同层后出现的吸顶项会推走前一项，不同层级会按层级顺序叠放。
   * 网格和瀑布流中的吸顶项必须通过 `getItemSpan` 占满所有列。
   */
  getStickyLevel?: (item: T, index: number) => number | undefined;

  /**
   * 返回吸顶项所属的组键；仅在 `getStickyLevel` 返回有效层级时生效。
   *
   * 同组不同层级会叠放，同组同层后项推走前项。进入新组后，新组边界会整体
   * 推走上一组的吸顶栈。未提供时所有吸顶项属于同一个默认组。
   */
  getStickyGroup?: (item: T, index: number) => string | number | undefined;

  /**
   * 在数据内容之前滚动的头部内容。
   *
   * 头部作为独立通栏元素参与原生布局，不进入普通数据项的回收池。
   */
  ListHeaderComponent?: ReactNode;

  /**
   * 在数据内容之后滚动的尾部内容。
   *
   * 尾部位于加载更多状态之前，并作为独立通栏元素参与原生布局。
   */
  ListFooterComponent?: ReactNode;

  /**
   * `data` 为空时显示的内容。
   *
   * 空状态位于列表头和列表尾之间，并作为通栏元素渲染。
   */
  ListEmptyComponent?: ReactNode;

  /**
   * 受控的下拉刷新状态，默认值为 `false`。
   *
   * `onRefresh` 触发后，调用方应尽快将其设为 `true`；刷新任务结束后再设为
   * `false`，原生层随后执行回弹动画。
   */
  refreshing?: boolean;

  /**
   * 用户下拉超过阈值并松手时调用。
   *
   * 未提供此回调时，下拉刷新会自动禁用，即使 `refreshEnabled` 为 `true`。
   */
  onRefresh?: () => void;

  /**
   * 是否允许用户手势触发下拉刷新，默认值为 `true`。
   *
   * 仅对纵向列表生效；仍需同时提供 `onRefresh`。
   */
  refreshEnabled?: boolean;

  /**
   * 触发刷新的可见下拉距离，单位为逻辑像素，默认值为 `80`。
   *
   * 该值同时用于计算刷新进度和刷新期间的内容保持距离。
   */
  refreshThreshold?: number;

  /**
   * 渲染自定义刷新头。
   *
   * `phase` 用于切换离散状态；`phaseValue`、`progress` 和 `offset` 是可在
   * Reanimated worklet 中直接读取的 `SharedValue`。刷新头覆盖在列表顶部，不占用
   * 普通数据项的回收槽位。
   */
  renderRefreshHeader?: (context: RefreshHeaderContext) => ReactNode;

  /**
   * 受控下拉二级配置。
   *
   * 松手位置位于刷新阈值与二楼阈值之间时执行普通刷新；达到二楼阈值后只请求
   * 打开二楼，不会同时触发 `onRefresh`。横向列表会忽略该配置。
   */
  secondLevel?: SecondLevelOptions;

  /**
   * 列表接近内容末端时调用，用于加载下一页数据。
   *
   * 同一组数据键只会触发一次。数据追加后会自动重新启用；加载失败时可通过
   * `renderLoadMoreFooter` 得到的 `retry` 或 ref 的 `retryEndReached()` 重试。
   */
  onEndReached?: () => void;

  /**
   * 触发触底加载的提前距离，以当前可视区域可容纳元素数量的比例表示，默认值为
   * `0.5`。
   *
   * 例如 `0.5` 表示剩余元素数量不超过约半个可视区域时触发。瀑布流由原生层按
   * 实际最深列的可见范围判断。
   */
  onEndReachedThreshold?: number;

  /**
   * 受控的加载更多状态，默认值为 `idle`。
   *
   * - `idle`：允许触发下一次加载。
   * - `loading`：正在加载，禁止重复触发。
   * - `error`：加载失败，等待显式重试。
   * - `finished`：没有更多数据，永久禁止自动触发。
   */
  loadMoreState?: LoadMoreState;

  /**
   * 渲染加载更多尾部。
   *
   * 上下文包含当前 `state` 和 `retry`。该尾部位于 `ListFooterComponent` 之后，
   * 作为独立通栏元素参与滚动。
   */
  renderLoadMoreFooter?: (context: LoadMoreFooterContext) => ReactNode;

  /**
   * 原生可视元素范围发生变化时调用。
   *
   * `first` 和 `last` 均为 `data` 中的索引，不包含列表头、列表尾、空状态和加载
   * 尾部；没有可见数据项时二者均为 `-1`。
   */
  onVisibleRangeChanged?: (range: VisibleRange) => void;

  /**
   * 提供给原生列表的预加载范围提示，按可视区域倍数计算，默认值为 `1`。
   *
   * 平台列表仍会根据滚动速度和自身预取策略决定实际创建的槽位数量，因此该值不是
   * 对活动元素数量的硬性保证。负数会被限制为 `0`。
   */
  overscan?: number;

  /** 列表外层容器样式。 */
  style?: StyleProp<ViewStyle>;

  /**
   * 原生滚动内容容器样式。
   *
   * 此样式会传给原生列表视图；不应用于单个回收项。
   */
  contentContainerStyle?: StyleProp<ViewStyle>;

  /** 用于自动化测试定位列表外层容器的标识。 */
  testID?: string;
}

/** `scrollToOffset()` 使用的滚动参数。 */
export interface ScrollToOffsetOptions {
  /** 目标主轴偏移量，单位为逻辑像素；纵向表示 Y，横向表示 X。 */
  offset: number;

  /** 是否以动画方式滚动，默认值为 `true`。 */
  animated?: boolean;
}

/** `scrollToIndex()` 使用的滚动参数。 */
export interface ScrollToIndexOptions {
  /** `data` 中的目标零基索引，必须位于当前数据范围内。 */
  index: number;

  /**
   * 目标项在可视区域中的相对位置，默认值为 `0`。
   *
   * `0` 对齐起始边，`0.5` 居中，`1` 对齐末端；超出范围的值会由原生层限制。
   */
  viewPosition?: number;

  /** 是否以动画方式滚动，默认值为 `true`。 */
  animated?: boolean;
}

/** `RecyclerList` 通过 ref 暴露的命令式控制接口。 */
export interface RecyclerListRef {
  /** 滚动到指定的主轴绝对偏移量。 */
  scrollToOffset(options: ScrollToOffsetOptions): void;

  /**
   * 滚动到指定数据项。
   *
   * 未测量的远距离目标会先使用预估尺寸定位，完成测量后由原生布局修正。
   */
  scrollToIndex(options: ScrollToIndexOptions): void;

  /**
   * 滚动到当前内容末端。
   *
   * `animated` 默认值为 `true`；瀑布流以最深列的末端作为内容末端。
   */
  scrollToEnd(options?: { animated?: boolean }): void;

  /**
   * 同步读取最近一次由原生层计算的可视数据索引范围。
   *
   * 没有可见数据项时返回 `{ first: -1, last: -1 }`。
   */
  getVisibleRange(): VisibleRange;

  /**
   * 清除当前数据版本的触底去重标记并尝试重新触发 `onEndReached`。
   *
   * 该方法主要供加载失败后的手动重试使用；`loading` 或 `finished` 状态不会触发。
   */
  retryEndReached(): void;

  /** 同步读取原生列表最近一次发布的滚动、内容尺寸和刷新状态快照。 */
  getState(): RecyclerListState;
}
