import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import PagerView from 'react-native-pager-view';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MEDIA_CACHE_DIRECTORY } from '../core/constants';
import type { PreviewMediaPageProps, PreviewMediaSource } from '../types';

const isRemote = (uri: string) => /^https?:\/\//i.test(uri);
const inferType = (source: PreviewMediaSource) =>
  source.type ??
  (/\.(mp4|mov|m4v|webm)(?:[?#]|$)/i.test(source.url) ? 'video' : 'image');

const resolveLocalSource = async (source: PreviewMediaSource) => {
  if (!isRemote(source.url)) return source.url;
  const directory = new Directory(Paths.cache, MEDIA_CACHE_DIRECTORY);
  directory.create({ idempotent: true, intermediates: true });
  const extension = inferType(source) === 'video' ? 'mp4' : 'jpg';
  const target = new File(directory, `preview-${Date.now()}.${extension}`);
  return (
    await File.downloadFileAsync(source.url, target, { idempotent: true })
  ).uri;
};

function ZoomableImage({ source }: { source: PreviewMediaSource }) {
  const scale = useSharedValue(1);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.max(1, Math.min(4, savedScale.value * event.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });
  const pan = Gesture.Pan()
    .onUpdate((event) => {
      if (scale.value > 1) {
        offsetX.value = savedX.value + event.translationX;
        offsetY.value = savedY.value + event.translationY;
      }
    })
    .onEnd(() => {
      savedX.value = offsetX.value;
      savedY.value = offsetY.value;
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const zoomed = scale.value > 1;
      scale.value = withTiming(zoomed ? 1 : 2);
      offsetX.value = withTiming(0);
      offsetY.value = withTiming(0);
      savedScale.value = zoomed ? 1 : 2;
      savedX.value = 0;
      savedY.value = 0;
    });
  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX.value },
      { translateY: offsetY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.media, animatedStyle]}>
        <Image
          source={source.url}
          style={styles.media}
          contentFit="contain"
          transition={120}
        />
      </Animated.View>
    </GestureDetector>
  );
}

function PreviewVideo({
  source,
  active,
}: {
  source: PreviewMediaSource;
  active: boolean;
}) {
  const player = useVideoPlayer(source.url, (instance) => {
    instance.loop = false;
  });
  useEffect(() => {
    if (!active) player.pause();
    // useVideoPlayer 会在卸载时释放并停止原生播放器，cleanup 再调用 pause 会命中已释放对象。
  }, [active, player]);
  return (
    <VideoView
      style={styles.media}
      player={player}
      nativeControls
      contentFit="contain"
    />
  );
}

export function PreviewMediaPage({
  sources,
  current = 0,
  showmenu = true,
  onClose,
  onBack,
}: PreviewMediaPageProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [active, setActive] = useState(current);
  const activeSource = sources[active];
  const pages = useMemo(
    () => sources.map((source, index) => ({ source, index })),
    [sources],
  );

  const openMenu = useCallback(() => {
    if (!activeSource) return;
    const save = async () => {
      const permission = await requestPermissionsAsync(true);
      if (!permission.granted) throw new Error('没有相册写入权限');
      await Asset.create(await resolveLocalSource(activeSource));
    };
    const share = async () => {
      const local = await resolveLocalSource(activeSource);
      if (!(await Sharing.isAvailableAsync()))
        throw new Error('当前设备不支持系统分享');
      await Sharing.shareAsync(local);
    };
    const run = (operation: () => Promise<void>) => {
      operation().catch((error: unknown) =>
        Alert.alert(
          '操作失败',
          error instanceof Error ? error.message : '请稍后重试',
        ),
      );
    };
    Alert.alert('媒体操作', undefined, [
      { text: '保存到相册', onPress: () => run(save) },
      { text: '系统分享', onPress: () => run(share) },
      { text: '取消', style: 'cancel' },
    ]);
  }, [activeSource]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          style={styles.iconButton}
          onPress={onBack ?? onClose}
        >
          <Text style={styles.iconText}>‹</Text>
        </Pressable>
        <Text style={styles.counter}>
          {active + 1} / {sources.length}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭"
          style={styles.iconButton}
          onPress={onClose}
        >
          <Text style={styles.iconText}>×</Text>
        </Pressable>
      </View>
      <PagerView
        style={styles.pager}
        initialPage={current}
        onPageSelected={(event) => setActive(event.nativeEvent.position)}
      >
        {pages.map(({ source, index }) => (
          <View
            key={`${source.url}-${index}`}
            style={{ width }}
            collapsable={false}
          >
            {inferType(source) === 'video' ? (
              <PreviewVideo source={source} active={index === active} />
            ) : (
              <ZoomableImage source={source} />
            )}
          </View>
        ))}
      </PagerView>
      {showmenu ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            style={styles.menuButton}
            onPress={openMenu}
          >
            <Text style={styles.menuText}>•••</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  header: {
    minHeight: 52,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#202020',
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { color: '#fff', fontSize: 34, lineHeight: 38 },
  counter: { color: '#fff', fontSize: 15, fontWeight: '600' },
  pager: { flex: 1 },
  media: { flex: 1, width: '100%', height: '100%' },
  footer: {
    minHeight: 64,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#171717',
  },
  menuButton: {
    width: 44,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: { color: '#fff', fontSize: 20, letterSpacing: 0 },
});
