import {
  VideoView as Video,
  type VideoViewProps,
  useVideoPlayer,
} from 'expo-video';
import { useEffect, useId } from 'react';
import { View } from 'react-native';

import { useCachedMedia } from '../../media-cache/use-cached-media';

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
  style,
  className,
  ...props
}: MyVideoProps) {
  const id = useId();
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
      if (autoplay && !pause) {
        player.play();
      }
    },
  );

  useEffect(() => {
    videoPlayer.loop = loop;
  }, [loop, videoPlayer]);

  useEffect(() => {
    videoPlayer.muted = muted;
  }, [muted, videoPlayer]);

  useEffect(() => {
    if (pause) {
      videoPlayer.pause();
    } else if (autoplay) {
      videoPlayer.play();
    }
  }, [autoplay, pause, videoPlayer]);

  return (
    <View id={id} className={className} style={style}>
      <Video
        {...props}
        player={videoPlayer}
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  );
}
