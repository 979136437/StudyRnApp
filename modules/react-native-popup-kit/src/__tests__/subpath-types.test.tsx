import { expectTypeOf, test } from 'vitest';

import {
  hideModal,
  showModal,
  useModal,
  type ModalFooterRenderProps,
  type ModalOptions,
  type ModalRenderProps,
} from '../modal';
import { hideToast, showToast, type ToastOptions } from '../toast';

test('exports toast and modal subpath APIs', () => {
  expectTypeOf(showToast).toEqualTypeOf<
    (options: ToastOptions) => Promise<void>
  >();
  expectTypeOf(hideToast).toEqualTypeOf<() => Promise<void>>();
  expectTypeOf(showModal).toEqualTypeOf<
    (options: ModalOptions) => Promise<void>
  >();
  expectTypeOf(hideModal).toEqualTypeOf<() => Promise<void>>();
  expectTypeOf(useModal).returns.toMatchTypeOf<{
    showModal(options: ModalOptions): Promise<void>;
    hideModal(): Promise<void>;
  }>();
});

test('footer render receives complete action values', () => {
  expectTypeOf<
    ModalFooterRenderProps['confirm']['text']
  >().toEqualTypeOf<string>();
  expectTypeOf<
    ModalFooterRenderProps['cancel']['text']
  >().toEqualTypeOf<string>();
  expectTypeOf<ModalFooterRenderProps['onConfirm']>().toEqualTypeOf<
    () => Promise<void>
  >();
  expectTypeOf<ModalFooterRenderProps['onCancel']>().toEqualTypeOf<
    () => void
  >();
});

test('modal render receives complete content and wrapped operations', () => {
  expectTypeOf<ModalRenderProps>().toMatchTypeOf<ModalFooterRenderProps>();
  expectTypeOf<ModalRenderProps['content']>().toEqualTypeOf<React.ReactNode>();
  expectTypeOf<ModalRenderProps['showCancel']>().toEqualTypeOf<boolean>();
  expectTypeOf<ModalRenderProps['close']>().toEqualTypeOf<
    () => Promise<void>
  >();
});

test('toast and modal options do not expose popup internals', () => {
  // @ts-expect-error Toast ids remain internal.
  const toast: ToastOptions = { id: 'toast', message: 'message' };
  // @ts-expect-error Modal display mode remains internal.
  const modal: ModalOptions = { content: 'content', displayMode: 'queue' };
  expectTypeOf(toast).toMatchTypeOf<ToastOptions>();
  expectTypeOf(modal).toMatchTypeOf<ModalOptions>();
});
