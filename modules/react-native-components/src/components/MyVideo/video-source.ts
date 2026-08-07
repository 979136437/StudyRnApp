import type { VideoSource } from 'expo-video';

interface ResolveVideoSourceOptions {
  cache: boolean;
  requestHeaders?: Record<string, string>;
  resolvedUri: string | null;
  sourceUri: string;
}

export function resolveVideoSource({
  cache,
  requestHeaders,
  resolvedUri,
  sourceUri,
}: ResolveVideoSourceOptions): VideoSource | null {
  if (!resolvedUri) {
    return null;
  }

  const isRemoteSource = resolvedUri === sourceUri;
  return {
    headers: isRemoteSource ? requestHeaders : undefined,
    uri: resolvedUri,
    // 远程播放与整文件下载并行时保留已播放分段，减少暂停恢复后的再次缓冲。
    useCaching: cache && isRemoteSource,
  };
}
