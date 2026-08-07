import { Link, useIsFocused } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  MyImage,
  MyVideo,
  type MyVideoVisibilityChangeEvent,
} from 'react-native-components';

const HOME_TEST_VIDEO_URL =
  'https://obs-happyvalley.obs.cn-south-1.myhuaweicloud.com/mp/137b76cb91a229d7f6bce32d3a9eaf8a.mp4';

export function HomeScreen(): React.JSX.Element {
  // 路由压栈时页面仍挂载，焦点状态用于补足几何监听无法识别的整页遮挡。
  const isFocused = useIsFocused();
  const [videoVisibility, setVideoVisibility] =
    useState<MyVideoVisibilityChangeEvent>();
  const handleVideoVisibilityChange = useCallback(
    (event: MyVideoVisibilityChangeEvent) => setVideoVisibility(event),
    [],
  );

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      style={styles.screen}
    >
      <View className="pt-safe" style={styles.navigation}>
        <Link href="/cache" asChild>
          <Pressable accessibilityRole="button" style={styles.cacheButton}>
            <Text style={styles.cacheButtonText}>缓存统计</Text>
          </Pressable>
        </Link>
        <Link href="/visibility-observer" asChild>
          <Pressable accessibilityRole="button" style={styles.cacheButton}>
            <Text style={styles.cacheButtonText}>可见性监听测试</Text>
          </Pressable>
        </Link>
        <Link href="/diagnostics" asChild>
          <Pressable accessibilityRole="button" style={styles.cacheButton}>
            <Text style={styles.cacheButtonText}>诊断信息</Text>
          </Pressable>
        </Link>
      </View>
      <MyVideo
        autoplay
        loop
        onVisibilityChange={handleVideoVisibilityChange}
        pause={!isFocused}
        style={styles.video}
        url={HOME_TEST_VIDEO_URL}
        visibilityThreshold={0.5}
      />
      <MyImage
        source={{
          uri: 'https://bjmnapi.happyvalley.link/uploads/20200703/2232b3134bdf5c89df95a20aede339fb.jpg',
        }}
        className="bg-white aspect-square rounded-md"
      />
      <MyImage
        source={{
          uri: 'https://bjmnapi.happyvalley.link/uploads/20260529/81ac1235d0f766d82357a0589bab9d07.jpg',
        }}
        className="bg-white aspect-square rounded-md"
      />
      <View style={styles.videoStatus}>
        <Text style={styles.videoStatusLabel}>视频状态</Text>
        <Text selectable style={styles.videoStatusValue}>
          {videoVisibility === undefined
            ? '等待可见性测量'
            : `${videoVisibility.isVisible ? '可见' : '不可见'} · ${(
                videoVisibility.visibleRatio * 100
              ).toFixed(0)}%`}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  cacheButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 6,
    flexGrow: 1,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  content: {
    gap: 16,
    padding: 16,
    paddingBottom: 48,
  },
  cacheButtonText: {
    color: '#202124',
    fontSize: 15,
    fontWeight: '600',
  },
  navigation: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  screen: { backgroundColor: '#ef4444' },
  video: {
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    borderRadius: 6,
    overflow: 'hidden',
    width: '100%',
  },
  videoStatus: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    gap: 4,
    padding: 16,
  },
  videoStatusLabel: { color: '#5f6368', fontSize: 13 },
  videoStatusValue: { color: '#202124', fontSize: 16, fontWeight: '700' },
});
