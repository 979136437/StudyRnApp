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
/>
```

## 瀑布流与吸顶

```tsx
<RecyclerList
  data={items}
  layout="masonry"
  numColumns={2}
  keyExtractor={(item) => item.id}
  getItemType={(item) => item.type}
  getItemSpan={(item) => item.type === 'header' ? 2 : 1}
  getStickyLevel={(item) => item.type === 'header' ? item.level : undefined}
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

## 嵌套列表

纵向列表项中可以放置横向 `RecyclerList`。给子列表提供稳定的 `listKey` 后，父项被回收时会保存横向位置，并在重新挂载时恢复。

首版不支持纵向列表内继续嵌套纵向列表，也不支持倒置列表和布局过渡动画。原生功能需要 Expo 开发构建，不能在 Expo Go 中运行。
