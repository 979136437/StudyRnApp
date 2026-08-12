export const ToastType = {
  SUCCESS: 'success',
  ERROR: 'error',
  LOADING: 'loading',
  NONE: 'none',
} as const;

export type ToastType = (typeof ToastType)[keyof typeof ToastType];

export const ToastPosition = {
  TOP: 'top',
  CENTER: 'center',
  BOTTOM: 'bottom',
} as const;

export type ToastPosition = (typeof ToastPosition)[keyof typeof ToastPosition];
