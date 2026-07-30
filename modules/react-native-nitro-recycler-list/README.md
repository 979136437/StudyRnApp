# react-native-nitro-recycler-list

面向 React Native 新架构的原生回收列表。Android 使用 `RecyclerView`，iOS 使用 `UICollectionView`，Nitro HybridView 负责类型安全的属性、命令和回收生命周期。

## 基础用法

```tsx
import { RecyclerList } from 'react-native-nitro-recycler-list';

<RecyclerList
  data={items}
  estimatedItemSize={120}
  keyExtractor={(item) => item.id}
  renderItem={({ item }) => <Card item={item} />}
/>;
```

## 瀑布流与吸顶

```tsx
<RecyclerList
  data={items}
  layout="masonry"
  numColumns={2}
  keyExtractor={(item) => item.id}
  getItemType={(item) => item.type}
  getItemSpan={(item) => (item.type === 'header' ? 2 : 1)}
  getStickyLevel={(item) => (item.type === 'header' ? item.level : undefined)}
  renderItem={renderItem}
/>
```

同层吸顶项会互相推顶，不同层级会依次叠放。吸顶项在网格和瀑布流中必须占满所有列。

## 刷新与触底加载

```tsx
<RecyclerList
  data={items}
  keyExtractor={(item) => item.id}
  renderItem={renderItem}
  refreshing={refreshing}
  onRefresh={refresh}
  renderRefreshHeader={({ phase, progress }) => (
    <RefreshHeader phase={phase} progress={progress} />
  )}
  loadMoreState={loadMoreState}
  onEndReached={loadMore}
  renderLoadMoreFooter={({ state, retry }) => (
    <LoadMoreFooter state={state} onRetry={retry} />
  )}
/>
```

刷新头上下文中的 `offset`、`progress` 和 `phaseValue` 均为 Reanimated
`SharedValue`。Android 与 iOS 通过 Fabric 直接事件在 UI Runtime 中更新这些值，
逐帧下拉动画不会依赖 React 重新渲染或普通 JavaScript 回调。

### Lottie 接入预留

本包不直接依赖 `lottie-react-native`。业务安装 Lottie 后，可以用
`useAnimatedProps` 将标准化的 `progress.value` 直接传给动画组件：

```tsx
const AnimatedLottieView = Animated.createAnimatedComponent(LottieView);

function LottieRefreshHeader({ progress }: RefreshHeaderContext) {
  const animatedProps = useAnimatedProps(() => ({
    progress: progress.value,
  }));

  return (
    <AnimatedLottieView
      animatedProps={animatedProps}
      autoPlay={false}
      loop={false}
      source={refreshAnimation}
    />
  );
}
```

下拉阶段使用 `progress` 映射动画帧；超过阈值后的弹性效果读取 `offset`；刷新循环
和结束片段根据低频 `phase` 或 UI Runtime 中的 `phaseValue` 切换。这样后续接入
Lottie 时不需要修改列表公共接口。

## 嵌套列表

纵向列表项中可以放置横向 `RecyclerList`。给子列表提供稳定的 `listKey` 后，父项被回收时会保存横向位置，并在重新挂载时恢复。

首版不支持纵向列表内继续嵌套纵向列表，也不支持倒置列表和布局过渡动画。原生功能需要 Expo 开发构建，不能在 Expo Go 中运行。
