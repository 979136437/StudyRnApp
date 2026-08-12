export const PopupDisplayMode = {
  QUEUE: 'queue',
  STACK: 'stack',
} as const;

export type PopupDisplayMode =
  (typeof PopupDisplayMode)[keyof typeof PopupDisplayMode];

export const PopupMode = {
  BOTTOM: 'bottom',
  TOP: 'top',
  CENTER: 'center',
  LEFT: 'left',
  RIGHT: 'right',
  FULLSCREEN: 'fullscreen',
} as const;

export type PopupMode = (typeof PopupMode)[keyof typeof PopupMode];
