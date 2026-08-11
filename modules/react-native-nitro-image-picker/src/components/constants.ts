import type { MediaPickerLabels, MediaPickerTheme } from '../types';

export type ResolvedMediaPickerLabels = Required<MediaPickerLabels>;

export const DEFAULT_LABELS: ResolvedMediaPickerLabels = {
  title: '选择照片和视频',
  cancel: '取消',
  done: '完成',
  albums: '相册',
  allMedia: '最近项目',
  grantAccessTitle: '需要访问照片',
  grantAccessDescription: '授权后可浏览并选择设备中的照片和视频。',
  grantAccess: '允许访问',
  manageAccess: '管理可访问项目',
  openSettings: '打开设置',
  empty: '暂无可选内容',
  retry: '重试',
  takePhoto: '拍照',
  recordVideo: '录像',
  preview: '预览',
  original: '原图',
  closePreview: '关闭',
  selectionLimitReached: '已达到选择上限',
  unavailable: '当前平台不支持相册访问',
  select: '选择',
  selected: '已选择',
  video: '视频',
  dismissMessage: '关闭提示',
};

export const LIGHT_THEME: MediaPickerTheme = {
  background: '#ffffff',
  surface: '#f2f2f7',
  text: '#111111',
  secondaryText: '#636366',
  accent: '#07c160',
  separator: '#d1d1d6',
  overlay: 'rgba(0, 0, 0, 0.45)',
  danger: '#ff3b30',
};

export const DARK_THEME: MediaPickerTheme = {
  background: '#000000',
  surface: '#353537',
  text: '#ffffff',
  secondaryText: '#aeaeb2',
  accent: '#07c160',
  separator: '#38383a',
  overlay: 'rgba(0, 0, 0, 0.55)',
  danger: '#ff453a',
};
