# react-native-nitro-refresh

基于现有 Nitro HybridObject 与 Fabric 原生视图实现的受控下拉刷新组件。公共 API、基础四阶段状态和组件用法对齐上游刷新组件，并提供可选的二级下拉状态；Android 与 iOS 的手势阻尼、保持和回弹继续由本模块维护，不依赖 MJRefresh 或 SmartRefreshLayout。

## 公共入口

模块仅提供三个运行时入口：

- `RefreshLayout`：连接滚动组件、受控属性、原生状态机与回调。
- `RefreshHeader`：声明一个具有固定数值高度的自定义刷新头。
- `RefreshState`：`Idle`、`Pulling`、`Refreshing`、`End` 四个基础状态，以及可选的 `Max` 二级状态。

旧的 `RefreshControl`、`RefreshPhase`、`RefreshResult` 和命令式 ref 接口不再导出，也不提供兼容别名。

## 基础用法

`RefreshLayout` 通过滚动组件的 `refreshControl` 属性使用。Header 通过 `header` 属性传入；Android 会由 React Native 自动把实际滚动组件注入到 `RefreshLayout`，iOS 会把 Fabric 刷新视图挂到原生 `UIScrollView`。

```tsx
import { useState } from 'react';
import { FlatList } from 'react-native';
import {
  RefreshHeader,
  RefreshLayout,
  RefreshState,
} from 'react-native-nitro-refresh';

const [refreshing, setRefreshing] = useState(false);

<FlatList
  data={data}
  renderItem={renderItem}
  refreshControl={
    <RefreshLayout
      enable
      refreshing={refreshing}
      header={
        <RefreshHeader style={{ height: 80 }}>
          <CustomHeader />
        </RefreshHeader>
      }
      onPulling={(state) => {
        console.log(state === RefreshState.Pulling);
      }}
      maxDistance={160}
      onMax={(state) => {
        console.log(state === RefreshState.Max);
      }}
      onRefreshing={() => {
        setRefreshing(true);
        void reload().finally(() => setRefreshing(false));
      }}
      onEnd={() => console.log('开始回弹')}
      onIdle={() => console.log('回弹完成')}
      onChangeOffset={(event) => {
        console.log(event.nativeEvent.offset);
      }}
    />
  }
/>;
```

## 状态顺序

公共状态严格按以下顺序发布，并对重复原生阶段去重：

1. 下拉但未达到 Header 高度时保持 `RefreshState.Idle`。
2. 达到触发阈值时进入 `RefreshState.Pulling`。
3. 正常松手后进入 `RefreshState.Refreshing`。
4. 调用方把 `refreshing` 改为 `false` 后进入 `RefreshState.End`。
5. 原生回弹完成后恢复 `RefreshState.Idle`。

默认最大下拉距离与 Header 高度一致，因此不会进入额外状态。显式传入大于 Header
高度的 `maxDistance` 后，达到该距离会进入 `RefreshState.Max` 并调用一次 `onMax`；
继续拖动不会重复调用，回拉到该距离以下会恢复 `Pulling`，再次达到时可以再次触发。
松手后仍进入受控的 `Refreshing`，业务可以使用 `Max` 和 `onMax` 驱动二级内容。

不足阈值松手、取消或失败的拖动不会进入 `Pulling`、`Refreshing` 或 `End`。内部 Nitro 的 `pulling`、`ready`、`success`、`failure`、`settling` 等阶段不会从公共入口泄漏。

## 受控刷新

`refreshing` 是唯一刷新控制源：

- 从 `false` 切换为 `true` 会程序化展开 Header，并进入 `Refreshing`。
- 从 `true` 切换为 `false` 会进入 `End`，随后执行原生回弹。
- 用户达到阈值并松手时会调用 `onRefreshing`；回调应立即把 `refreshing` 设置为 `true`。若调用方没有确认，组件会按当前 `false` 值结束刷新。
- 重复传入相同属性不会重启动画或重复触发阶段回调。
- `enable={false}` 的优先级高于 `refreshing`，会取消当前动作并恢复空闲状态。

## Header 高度

`RefreshHeader` 的 `style.height` 必须是大于 `0` 的固定数值。这个高度同时用于：

- 触发刷新阈值；
- 刷新中的内容保持高度；
- Header 位移与标准化进度计算。

缺少高度、百分比高度、`0`、负数、`NaN` 或无穷值会在开发环境输出警告，并回退到 `80`。原生层仍有最小值保护，防止非法数据造成负 inset 或除零。

`maxDistance` 控制刷新头允许展示的最大下拉距离，单位同样为 dp/pt。默认与 Header
高度一致；显式值必须大于或等于 Header 高度。小于阈值、非正数、`NaN` 或无穷值会
在开发环境输出警告并回退到 Header 高度。只有显式值大于 Header 高度时才启用 `Max`
状态与 `onMax` 回调。

## 位移事件

`onChangeOffset` 接收标准原生事件形状：

```ts
{ nativeEvent: { offset: number } }
```

`offset` 在 Android 上为 dp，在 iOS 上为 pt，并且已经经过 `maxDistance` 限制。连续位移先由 Fabric 直接交给 Reanimated 在界面线程更新；只有提供 `onChangeOffset` 时，模块才额外把对应值调度到 JavaScript。

## 支持范围

组件支持单个纵向、非倒置的以下滚动组件：

- `ScrollView`
- `FlatList`
- `SectionList`
- `@shopify/flash-list` 2

横向、`inverted`、多个滚动子组件或非滚动内容会在开发阶段报错。不要同时使用列表自身的 `refreshing` / `onRefresh` 快捷属性；刷新状态统一交给 `RefreshLayout`。

## Web 与 Expo Go

Web 平台不会加载 Nitro/Fabric 原生入口，也不会渲染刷新头；滚动组件保持原有 Web 滚动行为。`lottie-react-native` 的 Web 对等依赖为 `@lottiefiles/dotlottie-react`。

本模块包含自定义原生代码，无法在 Expo Go 中工作。需要使用已经包含本模块的 Expo 开发构建或正式构建；仅 JavaScript 的 Web 降级不受此限制。
