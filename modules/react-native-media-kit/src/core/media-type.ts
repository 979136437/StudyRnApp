import { MediaKitError } from './error';
import { normalizeSource } from './options';
import type { MediaSource, MediaType } from './types';

const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'heic',
  'heif',
  'bmp',
]);
const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'mov',
  'm4v',
  'webm',
  'avi',
  'mkv',
  '3gp',
]);

export const inferMediaType = (source: string | MediaSource): MediaType => {
  const normalized = normalizeSource(source);
  if (normalized.type) return normalized.type;
  const pathname = normalized.uri.split(/[?#]/, 1)[0] ?? '';
  const extension = pathname.match(/\.([^.\/]+)$/)?.[1]?.toLowerCase();
  if (extension && IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (extension && VIDEO_EXTENSIONS.has(extension)) return 'video';
  throw new MediaKitError(
    'INVALID_ARGUMENT',
    '无法推断媒体类型，请显式传入 type',
  );
};
