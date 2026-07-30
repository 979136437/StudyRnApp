import type {
  HybridView,
  HybridViewMethods,
  HybridViewProps,
} from 'react-native-nitro-modules';

/**
 * 原生列表支持的布局模式。
 *
 * `list` 为线性列表，`grid` 为规则网格，`masonry` 为按当前最短列放置的瀑布流。
 */
export type RecyclerLayout = 'list' | 'grid' | 'masonry';

/** 原生下拉刷新状态机向 JavaScript 发布的阶段。 */
export type NativeRefreshPhase =
  | 'idle'
  | 'pulling'
  | 'ready'
  | 'refreshing'
  | 'settling';

/** JavaScript 为一条数据生成并提交给原生布局引擎的只读描述符。 */
export interface ItemDescriptor {
  /** 数据项的稳定唯一键，用于差异更新、尺寸缓存和可视锚点。 */
  key: string;

  /** 数据项的回收类型；只有相同类型的原生宿主可以互相复用。 */
  type: string;

  /** 数据项占用的列数；线性布局中固定按 `1` 处理。 */
  span: number;

  /** 吸顶层级；`-1` 表示普通数据项，不参与吸顶布局。 */
  stickyLevel: number;

  /** 实际尺寸尚未测得时使用的主轴预估尺寸，单位为逻辑像素。 */
  estimatedSize: number;
}

/** 原生层将一个有限回收槽位绑定到数据项后发布给 JavaScript 的记录。 */
export interface SlotBinding {
  /** 原生列表实例内稳定的槽位编号，在槽位生命周期内保持不变。 */
  slotId: number;

  /** 当前绑定数据项在 `data` 中的零基索引。 */
  index: number;

  /** 当前绑定数据项的稳定键，用于隔离 React 子树状态。 */
  itemKey: string;

  /** 当前绑定数据项的回收类型。 */
  itemType: string;
}

/** 原生视口内至少部分可见的数据索引闭区间。 */
export interface VisibleRange {
  /** 第一个可见数据项的索引；没有可见数据项时为 `-1`。 */
  first: number;

  /** 最后一个可见数据项的索引；没有可见数据项时为 `-1`。 */
  last: number;
}

/** 原生列表在调用 `getState()` 时返回的只读状态快照。 */
export interface RecyclerListState {
  /** 当前主轴滚动偏移量，单位为逻辑像素。 */
  offset: number;

  /** 当前主轴内容总尺寸，单位为逻辑像素。 */
  contentSize: number;

  /** 第一个可见数据项的索引；没有可见数据项时为 `-1`。 */
  firstVisibleIndex: number;

  /** 最后一个可见数据项的索引；没有可见数据项时为 `-1`。 */
  lastVisibleIndex: number;

  /** 原生刷新状态机当前是否处于刷新保持阶段。 */
  refreshing: boolean;
}

/** JavaScript 写入原生 `RecyclerList` HybridView 的完整属性。 */
export interface RecyclerListViewProps extends HybridViewProps {
  /** 当前列表实例的稳定标识，用于隔离槽位、命令和嵌套滚动状态。 */
  listId: string;

  /** 与当前 `data` 顺序一致的布局描述符。 */
  descriptors: ItemDescriptor[];

  /** 当前布局模式。 */
  layout: RecyclerLayout;

  /** 是否沿水平方向滚动。 */
  horizontal: boolean;

  /** 网格或瀑布流的总列数。 */
  numColumns: number;

  /** 可视区域之外保留的预加载范围倍数。 */
  overscan: number;

  /** JavaScript 控制的刷新中状态。 */
  refreshing: boolean;

  /** 原生层是否接受下拉刷新手势。 */
  refreshEnabled: boolean;

  /** 下拉刷新触发距离，单位为逻辑像素。 */
  refreshThreshold: number;

  /** 触底回调相对可视区域的提前触发比例。 */
  endReachedThreshold: number;

  /** 原生层是否允许触发触底回调。 */
  endReachedEnabled: boolean;

  /** 活动回收槽位绑定关系发生变化时调用。 */
  onSlotsChanged: (bindings: SlotBinding[]) => void;

  /** 用户越过阈值并释放下拉手势时调用。 */
  onRefreshRequested: () => void;

  /** 下拉阶段、位移或进度变化时调用。 */
  onRefreshProgress: (
    phase: NativeRefreshPhase,
    offset: number,
    progress: number,
  ) => void;

  /** 当前内容进入触底阈值且满足去重条件时调用。 */
  onEndReached: () => void;

  /** 原生计算出的可视数据范围发生变化时调用。 */
  onVisibleRangeChanged: (range: VisibleRange) => void;
}

/** JavaScript 可同步调用的原生 `RecyclerList` HybridView 方法。 */
export interface RecyclerListViewMethods extends HybridViewMethods {
  /** 滚动到主轴绝对偏移量，单位为逻辑像素。 */
  scrollToOffset(offset: number, animated: boolean): void;

  /** 将指定索引滚动到视口相对位置。 */
  scrollToIndex(index: number, viewPosition: number, animated: boolean): void;

  /** 滚动到当前内容末端。 */
  scrollToEnd(animated: boolean): void;

  /** 同步读取当前可视数据范围。 */
  getVisibleRange(): VisibleRange;

  /** 同步读取当前原生状态快照。 */
  getState(): RecyclerListState;

  /** 清除触底去重标记并重新检查触发条件。 */
  retryEndReached(): void;

  /** 提交 React 内容的实测宽高并按需触发布局修正。 */
  updateMeasuredSize(key: string, width: number, height: number): void;
}

/** Nitro 生成绑定所使用的原生列表视图类型。 */
export type RecyclerListView = HybridView<
  RecyclerListViewProps,
  RecyclerListViewMethods
>;

/** 单个可回收 React 内容宿主写入原生 HybridView 的属性。 */
export interface RecyclerCellHostViewProps extends HybridViewProps {
  /** 所属列表实例标识。 */
  listId: string;

  /** 当前原生回收槽位编号。 */
  slotId: number;

  /** 当前绑定数据项的稳定键。 */
  itemKey: string;

  /** 当前绑定数据项的回收类型。 */
  itemType: string;
}

/** 可回收内容宿主继承的基础 HybridView 方法集合。 */
export type RecyclerCellHostViewMethods = HybridViewMethods;

/** Nitro 生成绑定所使用的可回收内容宿主视图类型。 */
export type RecyclerCellHostView = HybridView<
  RecyclerCellHostViewProps,
  RecyclerCellHostViewMethods
>;
