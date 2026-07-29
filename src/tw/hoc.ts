import {
  Image as ExpoImage,
  type ImageProps as ExpoImageProps,
} from 'expo-image';
import { cssInterop } from 'nativewind';

export const Image = cssInterop(ExpoImage, {
  className: {
    target: 'style',
    nativeStyleToProp: {
      objectFit: 'contentFit',
    },
  },
});

export type ImageProps = ExpoImageProps & { className?: string };
