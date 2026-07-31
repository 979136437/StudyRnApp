import { Link, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type RouteEntry = {
  href: Href;
  label: string;
};

type RouteGroup = {
  accent: string;
  accentBackground: string;
  startIndex: number;
  title: string;
  routes: readonly RouteEntry[];
};

const ROUTE_GROUPS = [
  {
    accent: '#147d64',
    accentBackground: '#e4f3ed',
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
    accent: '#2563a9',
    accentBackground: '#e7eff9',
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
    accent: '#b4532f',
    accentBackground: '#f8eae4',
    startIndex: 7,
    title: '复杂滚动',
    routes: [
      { href: '/recycler-list-tests/collapsible-tabs', label: '折叠多页' },
      { href: '/recycler-list-tests/complex-sticky', label: '复杂吸顶' },
      { href: '/recycler-list-tests/second-level', label: '下拉二级' },
    ],
  },
  {
    accent: '#6c5d99',
    accentBackground: '#eeeaf7',
    startIndex: 10,
    title: '工具',
    routes: [{ href: '/diagnostics' as Href, label: '诊断中心' }],
  },
] as const satisfies readonly RouteGroup[];

export default function Home(): React.JSX.Element {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <Text style={styles.eyebrow}>测试场景</Text>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Nitro Recycler List</Text>
            <View style={styles.countBlock}>
              <Text style={styles.count}>10</Text>
              <Text style={styles.countLabel}>入口</Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {ROUTE_GROUPS.map((group) => (
          <View key={group.title} style={styles.group}>
            <View style={styles.groupHeader}>
              <View
                style={[
                  styles.groupIndicator,
                  { backgroundColor: group.accent },
                ]}
              />
              <Text style={styles.groupTitle}>{group.title}</Text>
              <Text style={styles.groupCount}>{group.routes.length} 项</Text>
            </View>
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
                      accessibilityHint="进入对应测试页面"
                      style={styles.route}
                    >
                      <View
                        style={[
                          styles.routeIndexBlock,
                          { backgroundColor: group.accentBackground },
                        ]}
                      >
                        <Text
                          style={[styles.routeIndex, { color: group.accent }]}
                        >
                          {indexLabel}
                        </Text>
                      </View>
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
    color: '#87928d',
    fontSize: 24,
    lineHeight: 26,
    textAlign: 'right',
    width: 18,
  },
  content: {
    alignSelf: 'center',
    gap: 28,
    maxWidth: 720,
    paddingBottom: 40,
    paddingHorizontal: 18,
    paddingTop: 26,
    width: '100%',
  },
  count: {
    color: '#18221e',
    fontSize: 18,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  countBlock: {
    alignItems: 'flex-end',
    minWidth: 42,
  },
  countLabel: {
    color: '#7a8881',
    fontSize: 10,
    fontWeight: '700',
  },
  eyebrow: {
    color: '#5f6d66',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  group: { gap: 10 },
  groupCount: {
    color: '#7a8881',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  groupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 22,
    paddingHorizontal: 2,
  },
  groupIndicator: {
    borderRadius: 2,
    height: 14,
    marginRight: 8,
    width: 3,
  },
  groupTitle: {
    color: '#425049',
    flex: 1,
    fontSize: 12,
    fontWeight: '900',
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottomColor: '#dce2de',
    borderBottomWidth: 1,
  },
  headerInner: {
    alignSelf: 'center',
    maxWidth: 720,
    paddingBottom: 22,
    paddingHorizontal: 20,
    paddingTop: 20,
    width: '100%',
  },
  route: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#dce2de',
    borderCurve: 'continuous',
    borderRadius: 7,
    borderWidth: 1,
    boxShadow: '0 1px 2px rgba(25, 45, 36, 0.04)',
    columnGap: 12,
    flexDirection: 'row',
    minHeight: 62,
    paddingHorizontal: 12,
  },
  routeIndex: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  routeIndexBlock: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 5,
    height: 34,
    justifyContent: 'center',
    width: 38,
  },
  routeLabel: {
    color: '#18221e',
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  routeList: {
    gap: 8,
  },
  routePressed: {
    backgroundColor: '#edf1ef',
    opacity: 0.78,
  },
  safeArea: {
    backgroundColor: '#f4f6f5',
    flex: 1,
  },
  title: {
    color: '#18221e',
    flex: 1,
    fontSize: 25,
    fontWeight: '900',
  },
  titleRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    columnGap: 16,
    marginTop: 6,
  },
});
