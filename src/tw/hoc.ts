import {
  Image as ExpoImage,
  type ImageProps as ExpoImageProps,
} from 'expo-image';
import { cssInterop } from 'nativewind';

/**
 * 第三方组件注册：将 ExpoImage 的 className 映射到 style。
 * 告知编译引擎将 ExpoImage 的 `className` 编译合并至核心的 `style` 属性
 */
export const Image = cssInterop(ExpoImage, {
  className: {
    target: 'style',
    nativeStyleToProp: {
      objectFit: 'contentFit',
    },
  },
});

export type ImageProps = ExpoImageProps & { className?: string };
