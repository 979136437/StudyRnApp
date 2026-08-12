import { expect, expectTypeOf, test } from 'vitest';

import { PopupMode } from '../../constants';
import { ToastPosition, ToastType } from '../constants';
import {
  DEFAULT_TOAST_DURATION,
  getToastPopupMode,
  getToastVisibleDuration,
} from '../toast-options';
import type { ToastOptions } from '../types';

test('exports stable toast literals and options', () => {
  expectTypeOf(ToastType.SUCCESS).toEqualTypeOf<'success'>();
  expectTypeOf(ToastType.ERROR).toEqualTypeOf<'error'>();
  expectTypeOf(ToastType.LOADING).toEqualTypeOf<'loading'>();
  expectTypeOf(ToastType.NONE).toEqualTypeOf<'none'>();
  expectTypeOf(ToastPosition.TOP).toEqualTypeOf<'top'>();
  expectTypeOf(ToastPosition.CENTER).toEqualTypeOf<'center'>();
  expectTypeOf(ToastPosition.BOTTOM).toEqualTypeOf<'bottom'>();
  expectTypeOf<ToastOptions>().toMatchTypeOf<{ message: React.ReactNode }>();
});

test('resolves toast positions and durations', () => {
  expect(getToastPopupMode(undefined)).toBe(PopupMode.CENTER);
  expect(getToastPopupMode(ToastPosition.TOP)).toBe(PopupMode.TOP);
  expect(getToastPopupMode(ToastPosition.BOTTOM)).toBe(PopupMode.BOTTOM);
  expect(getToastVisibleDuration({ message: 'default' })).toBe(
    DEFAULT_TOAST_DURATION,
  );
  expect(
    getToastVisibleDuration({ message: 'loading', type: ToastType.LOADING }),
  ).toBeUndefined();
  expect(getToastVisibleDuration({ duration: 0, message: 'persistent' })).toBe(
    0,
  );
  expect(getToastVisibleDuration({ duration: -10, message: 'unsafe' })).toBe(0);
});
