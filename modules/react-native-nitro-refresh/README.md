# react-native-nitro-refresh

面向 React Native 新架构的可自定义下拉刷新控件。下拉物理由原生 Fabric 组件处理，状态与受控命令由 Nitro HybridObject 提供，刷新头动画通过 Reanimated SharedValue 在界面线程更新。

```tsx
import { RefreshControl } from 'react-native-nitro-refresh';

<RefreshControl
  refreshing={refreshing}
  onRefresh={onRefresh}
  pullDistance={96}
  renderHeader={({ progress, offset, phase }) => (
    <CustomHeader progress={progress} offset={offset} phase={phase} />
  )}
>
  <FlashList data={data} renderItem={renderItem} />
</RefreshControl>;
```

`pullDistance`、`maxPullDistance` 与 `dragRate` 均可省略，默认值依次为 `80`、`pullDistance * 2` 和 `0.5`。

`RefreshPhase` 同时提供运行时字面量和值类型，可使用 `RefreshPhase.REFRESHING`，也兼容直接判断字符串 `'refreshing'`。
