import { useEffect, useRef, useState } from 'react';

import { useOptionalMediaCache } from './MediaCacheProvider';
import type { MediaCacheResolveMode, MediaCacheSource } from '../types';

interface CachedMediaState {
  id?: string;
  key: string;
  uri: string;
}

interface UseCachedMediaOptions {
  cache: boolean;
  mode: MediaCacheResolveMode;
  onError?: (error: Error) => void;
  source: MediaCacheSource | null;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function reportCacheError(
  error: unknown,
  onError?: (error: Error) => void,
): void {
  const cacheError = toError(error);
  if (cacheError.name !== 'AbortError') {
    onError?.(cacheError);
  }
}

export function useCachedMedia({
  cache,
  mode,
  onError,
  source,
}: UseCachedMediaOptions): {
  loading: boolean;
  uri: string | null;
} {
  const context = useOptionalMediaCache();
  const onErrorRef = useRef(onError);
  const sourceRef = useRef(source);
  onErrorRef.current = onError;
  sourceRef.current = source;
  const sourceKey = source
    ? JSON.stringify([
        source.kind,
        source.uri,
        source.cacheKey,
        source.maxAgeMs,
        source.headers,
      ])
    : '';
  const [state, setState] = useState<CachedMediaState | null>(null);
  const shouldCache = cache && Boolean(source);

  if (shouldCache && !context) {
    throw new Error('启用媒体缓存时必须挂载 MediaCacheProvider');
  }

  const enabled = shouldCache && context?.enabled === true;
  const strategy = context?.strategy;

  useEffect(() => {
    const currentSource = sourceRef.current;
    if (!currentSource || !strategy) {
      return;
    }
    if (!enabled) {
      // 关闭后丢弃旧解析结果，避免重新开启时短暂读取已被手动清除的文件。
      setState(null);
      return;
    }

    let active = true;
    let retainedId: string | undefined;
    void strategy
      .resolve(currentSource, mode)
      .then((resolution) => {
        if (!active) {
          return;
        }
        retainedId = resolution.id;
        if (retainedId) {
          strategy.retain(retainedId);
        }
        setState({ id: retainedId, key: sourceKey, uri: resolution.uri });
        void resolution.backgroundTask?.catch((error: unknown) => {
          if (active) {
            reportCacheError(error, onErrorRef.current);
          }
        });
      })
      .catch((error: unknown) => {
        if (active) {
          setState({ key: sourceKey, uri: currentSource.uri });
          reportCacheError(error, onErrorRef.current);
        }
      });

    return () => {
      active = false;
      if (retainedId) {
        strategy.release(retainedId);
      }
    };
  }, [enabled, mode, sourceKey, strategy]);

  if (!source) {
    return { loading: false, uri: null };
  }
  if (!enabled) {
    return { loading: false, uri: source.uri };
  }
  if (state?.key === sourceKey) {
    return { loading: false, uri: state.uri };
  }
  return { loading: true, uri: null };
}
