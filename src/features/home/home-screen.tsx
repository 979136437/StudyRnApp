import { FlashList } from '@shopify/flash-list';
import { Href, Link } from 'expo-router';
import { Text, View, Pressable } from 'react-native';
import { rpx } from 'react-native-responsive-units';

export function HomeScreen(): React.JSX.Element {
  const list = [
    {
      title: '滚轮选择器',
      href: '/picker-view',
    },
    {
      title: '网页',
      href: '/webview',
    },
    {
      title: '交互列表',
      href: '/interactive-list',
    },
    {
      title: 'Popup 页面测试',
      href: '/popup-demo',
    },
    {
      title: 'Toast 与 Modal 测试',
      href: '/popup-components',
    },
    {
      title: '媒体能力测试',
      href: '/media-test',
    },
    {
      title: '响应式尺寸测试',
      href: '/responsive-units',
    },
  ];

  return (
    <>
      <FlashList
        data={list}
        renderItem={({ item }) => (
          <Link href={item.href as Href} asChild>
            <Pressable
              style={{ paddingHorizontal: rpx(32), paddingVertical: rpx(28) }}
            >
              <Text style={{ fontSize: rpx(24) }}>{item.title}</Text>
            </Pressable>
          </Link>
        )}
        keyExtractor={(item) => item.href}
        ItemSeparatorComponent={() => (
          <View
            className="border-b-gray-500"
            style={{ borderBottomWidth: rpx(1) }}
          />
        )}
        ListFooterComponent={() => <View className="pb-safe bg-red-500" />}
      />
    </>
  );
}
