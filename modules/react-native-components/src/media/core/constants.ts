import type { VideoQuality } from '../types';

export const MEDIA_LIMITS = {
  count: { default: 9, min: 1, max: 20 },
  duration: { default: 10, min: 3, max: 60 },
  imageQuality: { default: 80, min: 0, max: 100 },
  pageSize: 80,
} as const;

export const VIDEO_MAX_SIZE: Record<VideoQuality, number> = {
  low: 480,
  medium: 720,
  high: 1080,
};

export const DEFAULT_VIDEO_QUALITY: VideoQuality = 'medium';
export const KILOBITS_TO_BITS = 1000;
export const BYTES_PER_KILOBYTE = 1024;
export const MEDIA_CACHE_DIRECTORY = 'media-api';
