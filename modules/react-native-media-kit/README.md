# react-native-media-kit

面向 Expo iOS/Android 的无 UI 媒体能力。模块不维护选择状态，不提供相机、预览器、Hook、Popup 或导航；调用者负责全部界面和生命周期。Web 上的相册、保存、分享及原生处理会抛出 `MediaKitError`，错误码为 `UNAVAILABLE`。

## 相册选择

```ts
import {
  listAlbums,
  listMediaAssets,
  prepareMediaAsset,
  requestMediaLibraryPermission,
} from 'react-native-media-kit';

const permission = await requestMediaLibraryPermission();
if (!permission.granted) throw new Error('需要相册权限');

const albums = await listAlbums();
const page = await listMediaAssets({
  albumId: albums[0]?.id,
  mediaTypes: ['image', 'video'],
  offset: 0,
  limit: 60,
});

// 选择顺序、数量限制和翻页 offset 均由应用保存。
const selectedFile = await prepareMediaAsset(page.items[0].id).result;
```

## 拍摄后处理

相机由应用层持有。Vision Camera 返回路径后，再交给 media-kit 复制到受控缓存并读取元数据：

```ts
const task = prepareMediaFile(cameraFileUri, 'video', {
  compress: true,
  video: { quality: 'medium', fps: 30 },
});
const file = await task.result;
```

## 预览资源

```ts
const task = preparePreviewSource({
  uri: 'https://cdn.example.com/video.mp4',
  type: 'video',
});
const source = await task.result;

// 应用使用 Expo Image 或 Expo Video 渲染 source.uri。
// 视频可使用 source.thumbnailUri 作为封面。
```

本地预览只规范化 URI，不复制调用者文件；远程预览下载到受控缓存并标记为临时文件。

## 压缩与取消

```ts
const task = compressVideo(file.uri, {
  quality: 'high',
  bitrate: 2_000_000,
  fps: 30,
  resolution: 0.75,
});

cancelButton.onPress = () => task.cancel(); // 幂等
const compressed = await task.result;
```

图片默认质量为 80，视频默认质量为 `medium`。取消会停止排队或 Nitro 任务；无法中断的复制和下载在完成后立即回收产物，并以 `CANCELLED` 结算。

## 保存、分享与清理

```ts
await saveToMediaLibrary(source).result;
await shareMedia(source).result;

// 只会删除 media-kit 创建且仍登记为临时文件的 URI。
await removeTemporaryFiles([selectedFile, compressed, source]);
```

成功返回的临时文件由调用者决定何时清理。任务取消或失败产生、且未返回给调用者的文件由模块自动清理。调用者原文件和相册原件不会被删除。
