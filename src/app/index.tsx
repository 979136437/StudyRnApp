import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { FeedCard, type FeedItem } from '@/components/feed/feed-card';
import { HeroSource } from '@/components/hero/hero-transition';
import {
  RefreshAnimateHeader,
  RefreshNormalHeader,
} from '@/components/Refresh';

const REFRESH_DELAY_MS = 1_200;
const MAX_ITEM_COUNT = 12;
const CONTENT_HORIZONTAL_PADDING = 20;
const CONTENT_TOP_PADDING = 16;

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

type RefreshHeaderMode = 'normal' | 'animated';

const INITIAL_ITEMS: FeedItem[] = Array.from({ length: 10000 }, (_, index) => ({
  id: `initial-${index + 1}`,
  title: `晨间数据已同步${index + 1}`,
  summary: `今日任务与关键指标已经更新，团队可以开始处理新的工作项。`,
  time: `刚刚`,
}));

const renderFeedItem: ListRenderItem<FeedItem> = ({ item }) => (
  <View style={styles.itemColumn}>
    <HeroSource
      accessibilityLabel={`查看${item.title}`}
      heroId={`feed-${item.id}`}
      href={{
        pathname: '/feed/[id]',
        params: {
          id: item.id,
          summary: item.summary,
          time: item.time,
          title: item.title,
        },
      }}
      overlay={<FeedCard fill item={item} />}
    >
      <FeedCard item={item} />
    </HeroSource>
  </View>
);

const keyExtractor = (item: FeedItem): string => item.id;

export default function Home(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [headerMode, setHeaderMode] = useState<RefreshHeaderMode>('animated');
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState(INITIAL_ITEMS);
  const refreshCountRef = useRef(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * 用户下拉和按钮点击共用同一个受控入口。计时器引用同时充当互斥锁，避免原生
   * 回调、按钮连点或重复属性更新并发创建多个刷新任务。
   */
  const beginRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      return;
    }

    setRefreshing(true);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      refreshCountRef.current += 1;
      const refreshNumber = refreshCountRef.current;

      setItems((currentItems) =>
        [
          {
            id: `refresh-${refreshNumber}`,
            title: `收到第 ${refreshNumber} 条新动态`,
            summary: '最新工作进展已同步，当前列表内容保持在最近十二条以内。',
            time: timeFormatter.format(new Date()),
          },
          ...currentItems,
        ].slice(0, MAX_ITEM_COUNT),
      );
      setRefreshing(false);
    }, REFRESH_DELAY_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  const refreshControl =
    headerMode === 'animated' ? (
      <RefreshAnimateHeader
        animated
        onRefresh={beginRefresh}
        refreshing={refreshing}
      />
    ) : (
      <RefreshNormalHeader onRefresh={beginRefresh} refreshing={refreshing} />
    );

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <FlashList
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + CONTENT_TOP_PADDING },
        ]}
        data={items}
        ItemSeparatorComponent={ItemSeparator}
        keyExtractor={keyExtractor}
        masonry
        numColumns={2}
        ListHeaderComponent={
          <View style={styles.pageHeader}>
            <View style={styles.titleRow}>
              <View style={styles.titleCopy}>
                <Text style={styles.eyebrow}>TEAM PULSE</Text>
                <Text style={styles.title}>今日动态</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ busy: refreshing }}
                disabled={refreshing}
                onPress={beginRefresh}
                style={({ pressed }) => [
                  styles.refreshButton,
                  pressed && styles.refreshButtonPressed,
                  refreshing && styles.refreshButtonDisabled,
                ]}
              >
                {refreshing ? (
                  <ActivityIndicator color={colors.buttonText} size="small" />
                ) : (
                  <Text style={styles.refreshButtonText}>立即刷新</Text>
                )}
              </Pressable>
            </View>

            <View accessibilityRole="tablist" style={styles.segmentedControl}>
              <ModeButton
                disabled={refreshing}
                label="标准"
                mode="normal"
                selectedMode={headerMode}
                setMode={setHeaderMode}
              />
              <ModeButton
                disabled={refreshing}
                label="动画"
                mode="animated"
                selectedMode={headerMode}
                setMode={setHeaderMode}
              />
            </View>
          </View>
        }
        refreshControl={refreshControl}
        renderItem={renderFeedItem}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

interface ModeButtonProps {
  disabled: boolean;
  label: string;
  mode: RefreshHeaderMode;
  selectedMode: RefreshHeaderMode;
  setMode: (mode: RefreshHeaderMode) => void;
}

function ModeButton({
  disabled,
  label,
  mode,
  selectedMode,
  setMode,
}: ModeButtonProps): React.JSX.Element {
  const selected = mode === selectedMode;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={() => setMode(mode)}
      style={({ pressed }) => [
        styles.segment,
        selected && styles.segmentSelected,
        pressed && styles.segmentPressed,
        disabled && styles.segmentDisabled,
      ]}
    >
      <Text
        style={[styles.segmentText, selected && styles.segmentTextSelected]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ItemSeparator(): React.JSX.Element {
  return <View style={styles.separator} />;
}

const colors = {
  accent: '#087E5B',
  background: '#F4F6F8',
  border: '#DCE2E7',
  buttonText: '#FFFFFF',
  muted: '#66727D',
  pressed: '#E5E9EC',
  surface: '#FFFFFF',
  text: '#17212B',
} as const;

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32,
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING / 2,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
  },
  itemColumn: {
    marginInline: CONTENT_HORIZONTAL_PADDING / 4,
  },
  pageHeader: {
    marginBottom: 20,
  },
  refreshButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 6,
    height: 40,
    justifyContent: 'center',
    minWidth: 92,
    paddingHorizontal: 14,
  },
  refreshButtonDisabled: {
    opacity: 0.7,
  },
  refreshButtonPressed: {
    opacity: 0.82,
  },
  refreshButtonText: {
    color: colors.buttonText,
    fontSize: 14,
    fontWeight: '600',
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 5,
    flex: 1,
    height: 36,
    justifyContent: 'center',
  },
  segmentPressed: {
    backgroundColor: colors.pressed,
  },
  segmentDisabled: {
    opacity: 0.65,
  },
  segmentSelected: {
    backgroundColor: colors.surface,
  },
  segmentText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '500',
  },
  segmentTextSelected: {
    color: colors.text,
    fontWeight: '700',
  },
  segmentedControl: {
    backgroundColor: colors.border,
    borderRadius: 7,
    flexDirection: 'row',
    marginTop: 20,
    padding: 3,
  },
  separator: {
    height: 12,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    marginTop: 4,
  },
  titleCopy: {
    flex: 1,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
  },
});
