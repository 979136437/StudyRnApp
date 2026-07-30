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

## 按功能直接使用

包内提供已锁定关键能力的二次封装组件，业务无需重复传入布局模式，也不会误传与该
功能冲突的属性：

- `RecyclerGridList`：规则网格。
- `RecyclerMasonryList`：动态高度瀑布流。
- `RecyclerHorizontalList`：横向线性回收列表。
- `RecyclerStickyList`：要求提供吸顶层级。
- `RecyclerGroupedStickyList`：要求同时提供吸顶层级与排斥组键。
- `RecyclerSecondLevelList`：要求提供受控二楼配置。
- `RecyclerTabView`：共享折叠头多页容器。

所有列表组件都保留泛型数据推断，并透传与 `RecyclerList` 相同的
`RecyclerListRef`。

## 瀑布流与吸顶

```tsx
<RecyclerMasonryList
  data={items}
  numColumns={2}
  keyExtractor={(item) => item.id}
  getItemType={(item) => item.type}
  getItemSpan={(item) => (item.type === 'header' ? 2 : 1)}
  getStickyLevel={(item) => (item.type === 'header' ? item.level : undefined)}
  renderItem={renderItem}
/>
```

同层吸顶项会互相推顶，不同层级会依次叠放。吸顶项在网格和瀑布流中必须占满所有列。

通过 `getStickyGroup` 可以把多层吸顶项划分为独立分组。新组的第一个吸顶项进入
视口时会整体推走上一组的吸顶栈，避免旧组中缺失的层级继续残留。

## 共享折叠多页

```tsx
<RecyclerTabView
  tabs={tabs}
  collapsedHeaderHeight={0}
  renderHeader={() => <ProfileHeader />}
  renderScene={(tab) => (
    <RecyclerList
      data={dataByTab[tab.key]}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      listKey={`profile-${tab.key}`}
    />
  )}
/>
```

`RecyclerTabView` 内置 PagerView，支持点击和左右滑页。共享头与 Tab 栏只渲染一次，
每个场景必须直接返回本包的 `RecyclerList`。切页时会同步未完成的折叠距离，并保留
各页超过折叠区间后的深层滚动位置。

## 刷新与触底加载

```tsx
<RecyclerSecondLevelList
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

## 下拉二级

```tsx
<RecyclerList
  {...listProps}
  refreshThreshold={72}
  secondLevel={{
    open: secondLevelOpen,
    threshold: 176,
    onRequested: trackSecondLevelRequest,
    onOpenChange: setSecondLevelOpen,
    renderContent: ({ close }) => <SecondFloor onClose={close} />,
  }}
/>
```

普通刷新与二楼使用双阈值互斥分流：松手超过第一阈值触发刷新，超过第二阈值只请求
打开二楼。`open` 是受控状态；内容调用 `close()` 后，业务更新状态，原生层负责关闭
动画和手势复位。第二段 `phaseValue`、`progress` 与 `offset` 可以直接驱动 Reanimated
或后续 Lottie 动画。

## 嵌套列表

纵向列表项中可以放置横向 `RecyclerList`。给子列表提供稳定的 `listKey` 后，父项被回收时会保存横向位置，并在重新挂载时恢复。

首版不支持纵向列表内继续嵌套纵向列表，也不支持倒置列表和布局过渡动画。原生功能需要 Expo 开发构建，不能在 Expo Go 中运行。

Web 只提供静态共享头、Tab 切换和活动页列表，不保证原生折叠协调、分组吸顶推离与
手势二楼行为。
