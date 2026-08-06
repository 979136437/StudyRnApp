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

import { useCachedMedia } from '../../media-cache/use-cached-media';
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
  const autoplayRef = useRef(autoplay);
  const pauseRef = useRef(pause);
  const visibilityEnabledRef = useRef(visibilityEnabled);
  const visibilityMeasuredRef = useRef(!visibilityEnabled);
  const visibleRef = useRef(!visibilityEnabled);
  const resumeWhenVisibleRef = useRef(false);
  const previousVisibilityEnabledRef = useRef(visibilityEnabled);
  const onVisibilityChangeRef = useRef(onVisibilityChange);
  autoplayRef.current = autoplay;
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
  const videoPlayer = useVideoPlayer(
    uri
      ? {
          headers: uri === url ? requestHeaders : undefined,
          uri,
          useCaching: false,
        }
      : null,
    (player) => {
      player.loop = loop;
      player.muted = muted;
    },
  );
  const playingRef = useRef(videoPlayer.playing);

  const applyPlaybackPolicy = useCallback(() => {
    const command = resolveVisibilityPlaybackCommand({
      autoplay: autoplayRef.current,
      pause: pauseRef.current,
      playing: playingRef.current,
      resumeWhenVisible: resumeWhenVisibleRef.current,
      visibilityEnabled: visibilityEnabledRef.current,
      visibilityMeasured: visibilityMeasuredRef.current,
      visible: visibleRef.current,
    });

    if (command === 'pause') {
      videoPlayer.pause();
    } else if (command === 'play') {
      videoPlayer.play();
    }
  }, [videoPlayer]);

  const handleVisibilityChange = useCallback(
    (event: VisibilityChangeEvent): void => {
      if (visibilityEnabledRef.current) {
        const wasVisible = visibleRef.current;
        visibilityMeasuredRef.current = true;
        visibleRef.current = event.isVisible;

        if (wasVisible && !event.isVisible) {
          // 仅记住离屏前真实的播放状态，避免恢复用户已经手动暂停的视频。
          resumeWhenVisibleRef.current = playingRef.current;
        }
        applyPlaybackPolicy();
      }

      onVisibilityChangeRef.current?.(event);
    },
    [applyPlaybackPolicy],
  );

  useEffect(() => {
    videoPlayer.loop = loop;
  }, [loop, videoPlayer]);

  useEffect(() => {
    videoPlayer.muted = muted;
  }, [muted, videoPlayer]);

  useEffect(() => {
    const wasEnabled = previousVisibilityEnabledRef.current;
    if (wasEnabled !== visibilityEnabled) {
      previousVisibilityEnabledRef.current = visibilityEnabled;
      if (visibilityEnabled) {
        // 重新启用时先暂停并等待首次原生测量，防止未确认可见便继续播放。
        resumeWhenVisibleRef.current = playingRef.current;
        visibilityMeasuredRef.current = false;
        visibleRef.current = false;
      } else {
        visibilityMeasuredRef.current = true;
        visibleRef.current = true;
      }
    }

    applyPlaybackPolicy();
  }, [applyPlaybackPolicy, autoplay, pause, uri, visibilityEnabled]);

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
        } else if (!isPlaying && visibleRef.current) {
          resumeWhenVisibleRef.current = false;
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
