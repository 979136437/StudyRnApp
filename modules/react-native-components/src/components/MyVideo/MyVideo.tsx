import {
  VideoView as Video,
  type VideoViewProps,
  useVideoPlayer,
} from 'expo-video';
import { useCallback, useEffect, useId, useRef } from 'react';
import { StyleSheet } from 'react-native';
import {
  VisibilityObserver,
  type VisibilityChangeEvent,
} from 'react-native-nitro-visibility-observer';

import { useCachedMedia } from '../../media-cache/react/use-cached-media';
import { resolveVideoSource } from './video-source';
import { resolveVisibilityPlaybackCommand } from './visibility-playback';

export type MyVideoVisibilityChangeEvent = VisibilityChangeEvent;

export type MyVideoProps = Omit<VideoViewProps, 'player'> & {
  url: string;
  autoplay?: boolean;
  pause?: boolean;
  loop?: boolean;
  muted?: boolean;
  cache?: boolean;
  cacheKey?: string;
  cacheMaxAgeMs?: number;
  requestHeaders?: Record<string, string>;
  onCacheError?: (error: Error) => void;
  visibilityEnabled?: boolean;
  visibilityThreshold?: number;
  visibilityMinimumDurationMs?: number;
  visibilityMeasurementIntervalMs?: number;
  onVisibilityChange?: (event: MyVideoVisibilityChangeEvent) => void;
  className?: string;
};

export function MyVideo({
  url,
  autoplay = false,
  pause = false,
  loop = false,
  muted = false,
  cache = true,
  cacheKey,
  cacheMaxAgeMs,
  requestHeaders,
  onCacheError,
  visibilityEnabled = true,
  visibilityThreshold = 0.5,
  visibilityMinimumDurationMs = 0,
  visibilityMeasurementIntervalMs = 100,
  onVisibilityChange,
  style,
  className,
  ...props
}: MyVideoProps) {
  const id = useId();
  const autoplayPendingRef = useRef(autoplay);
  const pauseRef = useRef(pause);
  const visibilityEnabledRef = useRef(visibilityEnabled);
  const visibilityMeasuredRef = useRef(!visibilityEnabled);
  const visibleRef = useRef(!visibilityEnabled);
  const resumeWhenAllowedRef = useRef(false);
  const playbackBlockedRef = useRef(pause || visibilityEnabled);
  const previousAutoplayRef = useRef(autoplay);
  const previousVisibilityEnabledRef = useRef(visibilityEnabled);
  const onVisibilityChangeRef = useRef(onVisibilityChange);
  pauseRef.current = pause;
  visibilityEnabledRef.current = visibilityEnabled;
  onVisibilityChangeRef.current = onVisibilityChange;
  const { uri } = useCachedMedia({
    cache,
    mode: 'background',
    onError: onCacheError,
    source: {
      cacheKey,
      headers: requestHeaders,
      kind: 'video',
      maxAgeMs: cacheMaxAgeMs,
      uri: url,
    },
  });
  const previousUriRef = useRef(uri);
  const videoPlayer = useVideoPlayer(
    resolveVideoSource({
      cache,
      requestHeaders,
      resolvedUri: uri,
      sourceUri: url,
    }),
    (player) => {
      player.loop = loop;
      player.muted = muted;
    },
  );
  const playingRef = useRef(videoPlayer.playing);

  const syncPlaybackBlockState = useCallback(() => {
    const blocked =
      pauseRef.current ||
      (visibilityEnabledRef.current &&
        (!visibilityMeasuredRef.current || !visibleRef.current));

    if (!playbackBlockedRef.current && blocked) {
      // 只在首次受到系统策略阻塞时记录状态，避免多个不可见来源相互覆盖。
      const currentlyPlaying = videoPlayer.playing;
      playingRef.current = currentlyPlaying;
      resumeWhenAllowedRef.current = currentlyPlaying;
    }
    playbackBlockedRef.current = blocked;
  }, [videoPlayer]);

  const applyPlaybackPolicy = useCallback(() => {
    const command = resolveVisibilityPlaybackCommand({
      autoplayPending: autoplayPendingRef.current,
      pause: pauseRef.current,
      playing: playingRef.current,
      resumeWhenAllowed: resumeWhenAllowedRef.current,
      visibilityEnabled: visibilityEnabledRef.current,
      visibilityMeasured: visibilityMeasuredRef.current,
      visible: visibleRef.current,
    });

    if (command === 'pause') {
      videoPlayer.pause();
    } else if (command === 'play') {
      // 自动播放只消费一次，后续恢复必须以离开前确实正在播放为依据。
      autoplayPendingRef.current = false;
      resumeWhenAllowedRef.current = false;
      videoPlayer.play();
    }
  }, [videoPlayer]);

  const handleVisibilityChange = useCallback(
    (event: VisibilityChangeEvent): void => {
      if (visibilityEnabledRef.current) {
        visibilityMeasuredRef.current = true;
        visibleRef.current = event.isVisible;
        syncPlaybackBlockState();
        applyPlaybackPolicy();
      }

      onVisibilityChangeRef.current?.(event);
    },
    [applyPlaybackPolicy, syncPlaybackBlockState],
  );

  useEffect(() => {
    videoPlayer.loop = loop;
  }, [loop, videoPlayer]);

  useEffect(() => {
    videoPlayer.muted = muted;
  }, [muted, videoPlayer]);

  useEffect(() => {
    if (previousUriRef.current !== uri) {
      previousUriRef.current = uri;
      if (uri) {
        // 新播放源拥有独立的自动播放周期，不能继承上一条视频的恢复状态。
        autoplayPendingRef.current = autoplay;
        resumeWhenAllowedRef.current = false;
      }
    }

    if (previousAutoplayRef.current !== autoplay) {
      previousAutoplayRef.current = autoplay;
      autoplayPendingRef.current = autoplay;
    }

    const wasEnabled = previousVisibilityEnabledRef.current;
    if (wasEnabled !== visibilityEnabled) {
      previousVisibilityEnabledRef.current = visibilityEnabled;
      if (visibilityEnabled) {
        // 重新启用时先暂停并等待首次原生测量，防止未确认可见便继续播放。
        visibilityMeasuredRef.current = false;
        visibleRef.current = false;
      } else {
        visibilityMeasuredRef.current = true;
        visibleRef.current = true;
      }
    }

    syncPlaybackBlockState();
    applyPlaybackPolicy();
  }, [
    applyPlaybackPolicy,
    autoplay,
    pause,
    syncPlaybackBlockState,
    uri,
    visibilityEnabled,
  ]);

  useEffect(() => {
    const subscription = videoPlayer.addListener(
      'playingChange',
      ({ isPlaying }) => {
        playingRef.current = isPlaying;
        const blocked =
          pauseRef.current ||
          (visibilityEnabledRef.current &&
            (!visibilityMeasuredRef.current || !visibleRef.current));

        if (isPlaying && blocked) {
          // 原生控制条也不能绕过离屏或外部暂停状态。
          videoPlayer.pause();
        } else if (isPlaying) {
          autoplayPendingRef.current = false;
        } else if (!blocked) {
          // 未受系统策略阻塞时停止播放，视为用户操作或自然播放结束。
          autoplayPendingRef.current = false;
          resumeWhenAllowedRef.current = false;
        }
      },
    );

    return () => subscription.remove();
  }, [videoPlayer]);

  return (
    <VisibilityObserver
      id={id}
      className={className}
      enabled={visibilityEnabled}
      measurementIntervalMs={visibilityMeasurementIntervalMs}
      minimumVisibleDurationMs={visibilityMinimumDurationMs}
      onVisibilityChange={handleVisibilityChange}
      style={style}
      threshold={visibilityThreshold}
    >
      <Video {...props} player={videoPlayer} style={styles.video} />
    </VisibilityObserver>
  );
}

const styles = StyleSheet.create({
  video: { height: '100%', width: '100%' },
});
