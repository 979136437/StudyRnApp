import { Image, type ImageProps, type ImageSource } from 'expo-image';
import { cssInterop } from 'nativewind';

import { useCachedMedia } from '../../media-cache/use-cached-media';

const HTTP_URI_PATTERN = /^https?:\/\//i;

export type MyImageProps = Omit<ImageProps, 'cachePolicy'> & {
  cache?: boolean;
  cacheKey?: string;
  cacheMaxAgeMs?: number;
  onCacheError?: (error: Error) => void;
};

function getRemoteSource(source: ImageProps['source']): ImageSource | null {
  if (typeof source === 'string') {
    return HTTP_URI_PATTERN.test(source) ? { uri: source } : null;
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return null;
  }
  const imageSource = source as ImageSource;
  return typeof imageSource.uri === 'string' &&
    HTTP_URI_PATTERN.test(imageSource.uri)
    ? imageSource
    : null;
}

function replaceSourceUri(
  source: ImageProps['source'],
  uri: string | null,
): ImageProps['source'] {
  if (!uri) {
    return undefined;
  }
  if (typeof source === 'string') {
    return uri;
  }
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    const imageSource = source as ImageSource;
    return {
      ...imageSource,
      cacheKey: undefined,
      headers: uri === imageSource.uri ? imageSource.headers : undefined,
      uri,
    };
  }
  return source;
}

export const MyImage = cssInterop(
  function MyImage({
    cache = true,
    cacheKey,
    cacheMaxAgeMs,
    onCacheError,
    source,
    ...props
  }: MyImageProps) {
    const remoteSource = getRemoteSource(source);
    const { uri } = useCachedMedia({
      cache,
      mode: 'wait',
      onError: onCacheError,
      source: remoteSource?.uri
        ? {
            cacheKey: cacheKey ?? remoteSource.cacheKey,
            headers: remoteSource.headers,
            kind: 'image',
            maxAgeMs: cacheMaxAgeMs,
            uri: remoteSource.uri,
          }
        : null,
    });
    const resolvedSource = remoteSource
      ? replaceSourceUri(source, uri)
      : source;
    return <Image {...props} source={resolvedSource} cachePolicy="none" />;
  },
  {
    className: {
      target: 'style',
      nativeStyleToProp: {
        objectFit: 'contentFit',
      },
    },
  },
);
