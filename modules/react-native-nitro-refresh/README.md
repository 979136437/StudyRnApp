# react-native-nitro-refresh

面向 React Native 新架构的可自定义下拉刷新控件。下拉物理由原生 Fabric 组件处理，状态与受控命令由 Nitro HybridObject 提供，刷新头动画通过 Reanimated SharedValue 在界面线程更新。

## 基础用法

```tsx
import { useRef, useState } from 'react';
import {
  RefreshControl,
  RefreshResult,
  type RefreshControlRef,
} from 'react-native-nitro-refresh';

const refreshRef = useRef<RefreshControlRef>(null);
const [refreshing, setRefreshing] = useState(false);

<RefreshControl
  ref={refreshRef}
  refreshing={refreshing}
  onRefresh={() => setRefreshing(true)}
  pullDistance={96}
  resultDuration={800}
  renderHeader={({ progress, offset, phase }) => (
    <CustomHeader progress={progress} offset={offset} phase={phase} />
  )}
>
  <FlashList data={data} renderItem={renderItem} />
</RefreshControl>;

// 程序化触发，与用户下拉一样调用 onRefresh。
refreshRef.current?.beginRefresh();

// 结束时同步维护受控属性。
refreshRef.current?.finishRefresh(RefreshResult.SUCCESS);
setRefreshing(false);
```

## 命令式控制

`RefreshControlRef` 提供以下同步命令：

- `beginRefresh()`：进入刷新并触发一次 `onRefresh`。
- `cancelRefresh()`：取消当前下拉、刷新、结果展示或回弹，不显示结果态。
- `finishRefresh(result)`：以 `success` 或 `failure` 结束刷新，停留 `resultDuration` 后自动收起。
- `getState()`：同步返回 `{ phase, offset, refreshing }` 完整快照。
- `pullToMax()`：动画拉到 `maxPullDistance` 并停在 `ready`，等待开始或取消。

组件继续采用受控模型。调用 `finishRefresh()` 或 `cancelRefresh()` 时，调用方必须同时把 `refreshing` 更新为 `false`；调用 `beginRefresh()` 后，应在 `onRefresh` 中尽快把它更新为 `true`。

`RefreshPhase` 包含 `idle`、`pulling`、`ready`、`refreshing`、`success`、`failure` 和 `settling`。运行时可使用 `RefreshPhase.SUCCESS`，也可以直接比较字符串。

## 配置

`pullDistance`、`maxPullDistance`、`dragRate` 与 `resultDuration` 均可省略，默认值依次为 `80`、`pullDistance * 2`、`0.5` 和 `800` 毫秒。`resultDuration={0}` 会在结果阶段后立即开始回弹。

Web 平台保持无操作降级：滚动子组件原样渲染，所有命令均无操作，`getState()` 固定返回空闲快照。原生功能需要包含本模块的 Expo 开发构建，无法在 Expo Go 中运行。
