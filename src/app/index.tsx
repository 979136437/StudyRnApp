import { Link, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type RouteEntry = {
  href: Href;
  label: string;
};

type RouteGroup = {
  startIndex: number;
  title: string;
  routes: readonly RouteEntry[];
};

const ROUTE_GROUPS = [
  {
    startIndex: 1,
    title: '基础列表',
    routes: [
      { href: '/recycler-list-tests/featured-content', label: '精选内容' },
      {
        href: '/recycler-list-tests/dynamic-height-cards',
        label: '动态高度卡片',
      },
      { href: '/recycler-list-tests/short-content', label: '较短内容' },
    ],
  },
  {
    startIndex: 4,
    title: '数据与回收',
    routes: [
      {
        href: '/recycler-list-tests/nested-horizontal-lists',
        label: '横向嵌套列表',
      },
      { href: '/recycler-list-tests/more-content', label: '更多内容' },
      { href: '/recycler-list-tests/recycled-items', label: '回收项' },
    ],
  },
  {
    startIndex: 7,
    title: '复杂滚动',
    routes: [
      { href: '/recycler-list-tests/collapsible-tabs', label: '折叠多页' },
      { href: '/recycler-list-tests/complex-sticky', label: '复杂吸顶' },
      { href: '/recycler-list-tests/second-level', label: '下拉二级' },
    ],
  },
] as const satisfies readonly RouteGroup[];

export default function Home(): React.JSX.Element {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>NITRO RECYCLER LIST</Text>
        <View style={styles.titleRow}>
          <Text style={styles.title}>测试场景</Text>
          <Text style={styles.count}>09</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {ROUTE_GROUPS.map((group) => (
          <View key={group.title} style={styles.group}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            <View style={styles.routeList}>
              {group.routes.map((route, index) => {
                const indexLabel = String(group.startIndex + index).padStart(
                  2,
                  '0',
                );

                return (
                  <Link asChild href={route.href} key={route.href.toString()}>
                    <Pressable
                      accessibilityLabel={`打开${route.label}`}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.route,
                        pressed && styles.routePressed,
                      ]}
                    >
                      <Text style={styles.routeIndex}>{indexLabel}</Text>
                      <Text style={styles.routeLabel}>{route.label}</Text>
                      <Text accessibilityElementsHidden style={styles.chevron}>
                        ›
                      </Text>
                    </Pressable>
                  </Link>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  chevron: {
    color: '#7a8881',
    fontSize: 25,
    lineHeight: 28,
    width: 20,
  },
  content: {
    paddingBottom: 32,
    paddingHorizontal: 20,
  },
  count: {
    color: '#d56843',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  eyebrow: {
    color: '#147d64',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  group: {
    marginTop: 25,
  },
  groupTitle: {
    color: '#66766e',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 8,
  },
  header: {
    borderBottomColor: '#d8dfda',
    borderBottomWidth: 1,
    paddingBottom: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  route: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderBottomColor: '#e3e8e4',
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 58,
    paddingHorizontal: 14,
  },
  routeIndex: {
    color: '#147d64',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    width: 36,
  },
  routeLabel: {
    color: '#18221e',
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  routeList: {
    borderColor: '#d8dfda',
    borderRadius: 6,
    borderWidth: 1,
    overflow: 'hidden',
  },
  routePressed: {
    backgroundColor: '#e8eeea',
  },
  safeArea: {
    backgroundColor: '#f2f5f2',
    flex: 1,
  },
  title: {
    color: '#18221e',
    fontSize: 26,
    fontWeight: '900',
  },
  titleRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
});
