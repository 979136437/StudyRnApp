import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import {
  RecyclerList,
  type LoadMoreState,
} from 'react-native-nitro-recycler-list';

type DemoItem =
  | { id: string; kind: 'section'; title: string; level: number }
  | { id: string; kind: 'card'; title: string; height: number }
  | { id: string; kind: 'carousel'; title: string };

const initialItems: DemoItem[] = [
  { id: 'section-featured', kind: 'section', title: '精选内容', level: 0 },
  { id: 'card-1', kind: 'card', title: '动态高度卡片', height: 150 },
  { id: 'card-2', kind: 'card', title: '较短内容', height: 100 },
  { id: 'carousel', kind: 'carousel', title: '横向嵌套列表' },
  { id: 'section-more', kind: 'section', title: '更多内容', level: 0 },
  ...Array.from(
    { length: 20 },
    (_, index): DemoItem => ({
      id: `card-${index + 3}`,
      kind: 'card',
      title: `回收项 ${index + 3}`,
      height: 90 + (index % 4) * 35,
    }),
  ),
];

export default function RecyclerListDemo() {
  const [items, setItems] = useState(initialItems);
  const [refreshing, setRefreshing] = useState(false);
  const [loadMoreState, setLoadMoreState] = useState<LoadMoreState>('idle');

  const refresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setItems(initialItems);
      setRefreshing(false);
    }, 700);
  }, []);

  const loadMore = useCallback(() => {
    if (loadMoreState !== 'idle') return;
    setLoadMoreState('loading');
    setTimeout(() => {
      setItems((current) => [
        ...current,
        ...Array.from(
          { length: 8 },
          (_, index): DemoItem => ({
            id: `loaded-${current.length}-${index}`,
            kind: 'card',
            title: `追加内容 ${index + 1}`,
            height: 100 + (index % 3) * 40,
          }),
        ),
      ]);
      setLoadMoreState('idle');
    }, 700);
  }, [loadMoreState]);

  return (
    <RecyclerList
      data={items}
      estimatedItemSize={120}
      getItemSpan={(item) => (item.kind === 'card' ? 1 : 2)}
      getItemType={(item) => item.kind}
      getStickyLevel={(item) =>
        item.kind === 'section' ? item.level : undefined
      }
      keyExtractor={(item) => item.id}
      layout="masonry"
      loadMoreState={loadMoreState}
      numColumns={2}
      onEndReached={loadMore}
      onRefresh={refresh}
      refreshing={refreshing}
      renderItem={({ item }) => {
        if (item.kind === 'section') {
          return (
            <View style={{ backgroundColor: '#111827', padding: 14 }}>
              <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
                {item.title}
              </Text>
            </View>
          );
        }
        if (item.kind === 'carousel') {
          return (
            <View style={{ paddingVertical: 12 }}>
              <Text
                style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}
              >
                {item.title}
              </Text>
              <RecyclerList
                data={Array.from({ length: 12 }, (_, index) => index)}
                estimatedItemSize={112}
                horizontal
                keyExtractor={(value) => String(value)}
                listKey="demo-carousel"
                renderItem={({ item: value }) => (
                  <View
                    style={{
                      backgroundColor: '#e0f2fe',
                      marginRight: 8,
                      padding: 16,
                      width: 104,
                    }}
                  >
                    <Text>项目 {value + 1}</Text>
                  </View>
                )}
              />
            </View>
          );
        }
        return (
          <Pressable
            style={{
              backgroundColor: '#f3f4f6',
              minHeight: item.height,
              padding: 14,
            }}
          >
            <Text style={{ fontSize: 15 }}>{item.title}</Text>
          </Pressable>
        );
      }}
      renderLoadMoreFooter={({ state, retry }) => (
        <Pressable
          onPress={state === 'error' ? retry : undefined}
          style={{ alignItems: 'center', padding: 16 }}
        >
          {state === 'loading' ? (
            <ActivityIndicator />
          ) : (
            <Text>{state === 'error' ? '加载失败，点击重试' : ''}</Text>
          )}
        </Pressable>
      )}
      renderRefreshHeader={({ phase }) => (
        <View style={{ alignItems: 'center', padding: 12 }}>
          <Text>{phase === 'refreshing' ? '正在刷新' : '下拉刷新'}</Text>
        </View>
      )}
    />
  );
}
