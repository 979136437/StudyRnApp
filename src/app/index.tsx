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
  PopupProvider,
  closeAllPopups,
  closePopup,
  hideLoading,
  showLoading,
  showModal,
  showPopup,
  showToast,
  useModal,
  useToast,
  type PopupComponentProps,
  type PopupId,
} from 'react-native-popup-kit';
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

function openGlobalModal(): void {
  void showModal({
    content: '输入备注并确认，结果会通过 Promise 返回。',
    editable: true,
    placeholderText: '备注',
    title: '全局 Modal',
  }).then(
    (result) => {
      showToast({
        icon: result.confirm ? 'success' : 'none',
        title: result.confirm
          ? `已确认：${result.content || '无备注'}`
          : '已取消',
      });
    },
    () => undefined,
  );
}

function closeEveryPopup(): void {
  void closeAllPopups().then((result) => {
    showToast({ icon: 'none', title: `已关闭 ${result.closed} 个弹窗` });
  });
}

export default function Home(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [headerMode, setHeaderMode] = useState<RefreshHeaderMode>('animated');
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState(INITIAL_ITEMS);
  const [activePopupId, setActivePopupId] = useState<PopupId | null>(null);
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

  const openCustomPopup = (): void => {
    const task = showPopup({
      component: BottomPopupExample,
      placement: 'bottom',
    });
    setActivePopupId(task.id);
    void task.then(
      () =>
        setActivePopupId((currentId) =>
          currentId === task.id ? null : currentId,
        ),
      () =>
        setActivePopupId((currentId) =>
          currentId === task.id ? null : currentId,
        ),
    );
  };

  const closeCurrentPopup = (): void => {
    if (activePopupId === null) {
      showToast({ icon: 'none', title: '当前没有可关闭的 Popup' });
      return;
    }
    void closePopup(activePopupId);
  };

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

            <View style={styles.demoSection}>
              <View style={styles.demoHeading}>
                <Text style={styles.demoTitle}>全局 API</Text>
                <Text style={styles.demoMeta}>根 PopupProvider</Text>
              </View>
              <View style={styles.demoActions}>
                <DemoButton
                  label="Toast"
                  onPress={() =>
                    showToast({ icon: 'success', title: '全局 Toast 已显示' })
                  }
                />
                <DemoButton
                  label="Loading"
                  onPress={() => showLoading({ title: '正在处理' })}
                />
                <DemoButton
                  label="关闭 Loading"
                  onPress={() => void hideLoading({ noConflict: true })}
                />
                <DemoButton label="Modal" onPress={openGlobalModal} />
                <DemoButton label="底部 Popup" onPress={openCustomPopup} />
                <DemoButton
                  disabled={activePopupId === null}
                  label="关闭当前"
                  onPress={closeCurrentPopup}
                />
                <DemoButton label="关闭全部" onPress={closeEveryPopup} />
              </View>
            </View>

            <PopupProvider scope="local">
              <LocalPopupExamples />
            </PopupProvider>
          </View>
        }
        refreshControl={refreshControl}
        renderItem={renderFeedItem}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

function BottomPopupExample({ close }: PopupComponentProps): React.JSX.Element {
  return (
    <View style={styles.bottomPopup}>
      <View style={styles.popupHandle} />
      <Text style={styles.popupTitle}>自定义底部 Popup</Text>
      <Text style={styles.popupCopy}>
        该内容通过 showPopup 的 component 选项传入。
      </Text>
      <DemoButton label="完成" onPress={() => void close()} primary />
    </View>
  );
}

function LocalPopupExamples(): React.JSX.Element {
  const { showToast: showLocalToast } = useToast();
  const { showModal: showLocalModal } = useModal();

  return (
    <View style={styles.demoSection}>
      <View style={styles.demoHeading}>
        <Text style={styles.demoTitle}>局部 Hooks</Text>
        <Text style={styles.demoMeta}>最近的 PopupProvider</Text>
      </View>
      <View style={styles.demoActions}>
        <DemoButton
          label="局部 Toast"
          onPress={() =>
            showLocalToast({ icon: 'none', title: '只在局部宿主内显示' })
          }
        />
        <DemoButton
          label="局部 Modal"
          onPress={() => {
            void showLocalModal({
              content: '该弹窗由 useModal 调用。',
              title: '局部作用域',
            }).catch(() => undefined);
          }}
        />
      </View>
    </View>
  );
}

interface DemoButtonProps {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  primary?: boolean;
}

function DemoButton({
  disabled = false,
  label,
  onPress,
  primary = false,
}: DemoButtonProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.demoButton,
        primary && styles.demoButtonPrimary,
        pressed && styles.demoButtonPressed,
        disabled && styles.demoButtonDisabled,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[styles.demoButtonText, primary && styles.demoButtonTextPrimary]}
      >
        {label}
      </Text>
    </Pressable>
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
  bottomPopup: {
    alignItems: 'stretch',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    gap: 12,
    paddingBottom: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    width: '100%',
  },
  content: {
    paddingBottom: 32,
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING / 2,
  },
  demoActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  demoButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    minWidth: 96,
    paddingHorizontal: 12,
  },
  demoButtonDisabled: {
    opacity: 0.45,
  },
  demoButtonPressed: {
    opacity: 0.7,
  },
  demoButtonPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  demoButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  demoButtonTextPrimary: {
    color: colors.buttonText,
  },
  demoHeading: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  demoMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  demoSection: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
    paddingTop: 18,
  },
  demoTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
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
    gap: 20,
    marginBottom: 20,
  },
  popupCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  popupHandle: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: 2,
    height: 4,
    width: 36,
  },
  popupTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
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
