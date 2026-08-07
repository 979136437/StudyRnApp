const { AndroidConfig, withInfoPlist } = require('expo/config-plugins');

const DEFAULT_PHOTOS_PERMISSION =
  'Allow $(PRODUCT_NAME) to access photos and videos you choose.';
const DEFAULT_CAMERA_PERMISSION =
  'Allow $(PRODUCT_NAME) to use the camera to capture photos and videos.';
const DEFAULT_MICROPHONE_PERMISSION =
  'Allow $(PRODUCT_NAME) to use the microphone while recording video.';

/**
 * 权限说明由宿主明确配置，模块只提供安全默认值，避免业务文案散落在原生工程中。
 */
module.exports = function withNitroImagePicker(config, options = {}) {
  const nextConfig = withInfoPlist(config, (result) => {
    result.modResults.NSPhotoLibraryUsageDescription =
      options.photosPermission ?? DEFAULT_PHOTOS_PERMISSION;
    result.modResults.NSCameraUsageDescription =
      options.cameraPermission ?? DEFAULT_CAMERA_PERMISSION;
    result.modResults.NSMicrophoneUsageDescription =
      options.microphonePermission ?? DEFAULT_MICROPHONE_PERMISSION;
    return result;
  });

  return AndroidConfig.Permissions.withPermissions(nextConfig, [
    'android.permission.READ_MEDIA_IMAGES',
    'android.permission.READ_MEDIA_VIDEO',
    'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
    'android.permission.CAMERA',
    'android.permission.RECORD_AUDIO',
  ]);
};
