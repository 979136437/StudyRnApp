/** 公共刷新头缺少有效固定高度时使用的安全高度，单位为 dp/pt。 */
export const DEFAULT_REFRESH_HEADER_HEIGHT = 80;

/** 原生容器允许展示的最大位移相对于刷新头高度的倍数。 */
export const REFRESH_MAX_DISTANCE_MULTIPLIER = 2;

/** 原生下拉位移转换为触发距离时使用的默认比例。 */
export const DEFAULT_REFRESH_DRAG_RATE = 1;

/** Android 与 iOS 结束刷新、程序化展开时统一使用的回弹时长。 */
export const REBOUND_DURATION_MS = 280;

/** Android 原生层防止除零的最小拖动比例。 */
export const MIN_REFRESH_DRAG_RATE = 0.01;
