import { useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FeedCard, type FeedItem } from '@/components/feed/feed-card';
import { HeroPage } from '@/components/hero/hero-page';
import { HeroTarget } from '@/components/hero/hero-transition';

interface FeedRouteParams {
  id?: string | string[];
  summary?: string | string[];
  time?: string | string[];
  title?: string | string[];
}

function firstParam(
  value: string | string[] | undefined,
  fallback: string,
): string {
  if (Array.isArray(value)) {
    return value[0] ?? fallback;
  }
  return value ?? fallback;
}

export default function FeedDetail(): React.JSX.Element {
  const params = useLocalSearchParams() as FeedRouteParams;
  const insets = useSafeAreaInsets();
  const item: FeedItem = {
    id: firstParam(params.id, 'unknown'),
    summary: firstParam(params.summary, '暂无动态摘要。'),
    time: firstParam(params.time, '刚刚'),
    title: firstParam(params.title, '动态详情'),
  };
  const heroId = `feed-${item.id}`;

  return (
    <HeroPage heroId={heroId}>
      {({ goBack }) => (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingBottom: insets.bottom + 32,
              paddingTop: insets.top + 12,
            },
          ]}
          contentInsetAdjustmentBehavior="automatic"
          style={styles.screen}
        >
          <Pressable
            accessibilityLabel="返回"
            accessibilityRole="button"
            hitSlop={8}
            onPress={goBack}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.backButtonPressed,
            ]}
          >
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>

          <HeroTarget heroId={heroId}>
            <FeedCard item={item} selectable />
          </HeroTarget>

          <View style={styles.details}>
            <Text selectable style={styles.eyebrow}>
              动态详情
            </Text>
            <Text selectable style={styles.heading}>
              {item.title}
            </Text>
            <Text selectable style={styles.body}>
              {item.summary}
            </Text>
            <View style={styles.metadata}>
              <Text selectable style={styles.metadataLabel}>
                更新时间
              </Text>
              <Text selectable style={styles.metadataValue}>
                {item.time}
              </Text>
            </View>
          </View>
        </ScrollView>
      )}
    </HeroPage>
  );
}

const colors = {
  accent: '#087E5B',
  background: '#F4F6F8',
  border: '#DCE2E7',
  muted: '#66727D',
  pressed: '#E5E9EC',
  surface: '#FFFFFF',
  text: '#17212B',
} as const;

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderCurve: 'continuous',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  backButtonPressed: {
    backgroundColor: colors.pressed,
  },
  backIcon: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 32,
  },
  body: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 25,
  },
  content: {
    gap: 20,
    paddingHorizontal: 20,
  },
  details: {
    gap: 12,
    paddingHorizontal: 4,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  heading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  metadata: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
  },
  metadataLabel: {
    color: colors.muted,
    fontSize: 14,
  },
  metadataValue: {
    color: colors.text,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
});
