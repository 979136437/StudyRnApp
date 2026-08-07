import type { ImagePicker } from '../specs/ImagePicker.nitro';

const unavailable = (): never => {
  throw new Error('[E_UNAVAILABLE] 当前平台不支持 Nitro 相册模块');
};

export const nativeImagePicker: ImagePicker = new Proxy(
  {},
  { get: () => unavailable },
) as ImagePicker;
