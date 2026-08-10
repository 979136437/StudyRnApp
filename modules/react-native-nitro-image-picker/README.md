# react-native-nitro-image-picker

基于 `react-native-nitro-modules` 的 Android/iOS 媒体选择模块。它同时提供系统选择器、可完全自绘的无头相册 API，以及一套可直接使用的默认界面。

## 宿主接入

本目录是独立 workspace 包，本次实现没有修改根 `package.json`。获得宿主修改授权后，需要把包加入应用依赖并在 Expo 配置中启用插件：

```json
{
  "expo": {
    "plugins": [
      [
        "react-native-nitro-image-picker",
        {
          "photosPermission": "允许 $(PRODUCT_NAME) 访问您选择的照片和视频",
          "cameraPermission": "允许 $(PRODUCT_NAME) 使用相机拍摄照片和视频",
          "microphonePermission": "允许 $(PRODUCT_NAME) 在录像时使用麦克风"
        }
      ]
    ]
  }
}
```

这些权限说明不应包含密钥、令牌或用户隐私数据。未来若接入云上传，凭据必须通过环境变量和服务端签名提供，不能写入应用源码。

Nitro HybridView 要求 React Native 新架构。本项目当前的 React Native 0.86 满足要求，但自定义原生模块不能在 Expo Go 中使用。

## 系统选择器

```tsx
import {
  getPendingResultAsync,
  launchCameraAsync,
  launchImageLibraryAsync,
} from 'react-native-nitro-image-picker';

const result = await launchImageLibraryAsync({
  mediaTypes: ['images', 'videos'],
  allowsMultipleSelection: true,
  selectionLimit: 9,
  orderedSelection: true,
});

const capture = await launchCameraAsync({ mediaType: 'image' });
const recovered = await getPendingResultAsync();
```

取消时返回 `{ canceled: true, assets: null }`。成功资源位于应用缓存目录，可能被系统清理；需要长期保存时应由业务复制到持久目录。

## 默认 UI

```tsx
import { MediaPickerModal } from 'react-native-nitro-image-picker';

<MediaPickerModal
  visible={visible}
  selectionLimit={9}
  mediaTypes={['images', 'videos']}
  onCancel={() => setVisible(false)}
  onComplete={(result) => {
    setVisible(false);
    consume(result.assets);
  }}
/>;
```

`MediaPickerView` 可直接嵌入页面。两种组件均支持主题、文案、列数、媒体类型、初始选择、header、资源蒙层、空状态和权限状态覆盖。导入模块或渲染不可见的 `MediaPickerModal` 不会创建原生相册对象；打开选择器时只读取当前权限状态，用户点击授权操作后才会请求系统权限。

首版预览图片和视频封面，但不内置视频播放、裁剪、压缩、EXIF、位置数据或 Live Photo 配对导出。

## 自定义 UI

```tsx
import {
  MediaThumbnail,
  getAlbumsAsync,
  getAssetsAsync,
  requestMediaLibraryPermissionsAsync,
  resolveAssetsAsync,
} from 'react-native-nitro-image-picker';

await requestMediaLibraryPermissionsAsync(['images', 'videos']);
const albums = await getAlbumsAsync();
const page = await getAssetsAsync({ albumId: albums[0]?.id, first: 60 });

<MediaThumbnail assetId={page.assets[0].assetId} style={{ width: 96, height: 96 }} />;

const selected = await resolveAssetsAsync(['content-or-ph-asset-id'], {
  shouldDownloadFromNetwork: true,
});
```

分页游标是不透明值，只能传回相同查询；媒体库变化后应从第一页重新请求。有限权限下只会返回系统允许访问的资源，可调用 `presentLimitedLibraryPickerAsync` 管理范围。

## 缓存与错误

- `clearCacheAsync()` 仅删除 `nitro-image-picker` 自有缓存，不修改系统相册。
- 同一时间只能展示一个系统选择器或相机，重复调用抛出 `E_PICKER_BUSY`。
- 公共错误为 `NitroImagePickerError`，包含稳定的 `code`。
- Web 导入安全，但所有原生调用都会返回 `E_UNAVAILABLE`。
