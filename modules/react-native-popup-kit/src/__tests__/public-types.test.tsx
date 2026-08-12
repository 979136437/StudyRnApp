import { expectTypeOf, test } from 'vitest';

import {
  PopupDisplayMode,
  PopupMode,
  PopupProvider,
  hidePopup,
  showPopup,
  usePopup,
  type PopupController,
  type PopupOptions,
} from '../index';

test('exports the documented popup API types', () => {
  expectTypeOf(showPopup).toEqualTypeOf<
    (options: PopupOptions) => Promise<string>
  >();
  expectTypeOf(hidePopup).toEqualTypeOf<(id: string) => Promise<void>>();
  expectTypeOf(usePopup).toEqualTypeOf<() => PopupController>();
  expectTypeOf<PopupDisplayMode>().toEqualTypeOf<'queue' | 'stack'>();
});

test('accepts popup and overlay styles instead of backgroundColor', () => {
  const options: PopupOptions = {
    children: 'content',
    displayMode: PopupDisplayMode.STACK,
    mode: PopupMode.CENTER,
    overlayContent: 'custom overlay',
    overlayStyle: [{ backgroundColor: '#0008' }],
    popupStyle: { backgroundColor: '#fff', borderRadius: 8 },
  };
  // @ts-expect-error backgroundColor was replaced by popupStyle.
  const legacy: PopupOptions = { children: 'content', backgroundColor: '#fff' };
  expectTypeOf(options).toMatchTypeOf<PopupOptions>();
  expectTypeOf(legacy).toMatchTypeOf<PopupOptions>();
});

test('exports stable literal values for displayMode and mode', () => {
  expectTypeOf(PopupDisplayMode.QUEUE).toEqualTypeOf<'queue'>();
  expectTypeOf(PopupDisplayMode.STACK).toEqualTypeOf<'stack'>();
  expectTypeOf(PopupMode.BOTTOM).toEqualTypeOf<'bottom'>();
  expectTypeOf(PopupMode.TOP).toEqualTypeOf<'top'>();
  expectTypeOf(PopupMode.CENTER).toEqualTypeOf<'center'>();
  expectTypeOf(PopupMode.LEFT).toEqualTypeOf<'left'>();
  expectTypeOf(PopupMode.RIGHT).toEqualTypeOf<'right'>();
  expectTypeOf(PopupMode.FULLSCREEN).toEqualTypeOf<'fullscreen'>();
});

test('PopupProvider does not accept a scope property', () => {
  const valid = <PopupProvider>content</PopupProvider>;
  // @ts-expect-error Provider location determines its global or local role.
  const invalid = <PopupProvider scope="global">content</PopupProvider>;
  expectTypeOf(valid).toMatchTypeOf<React.JSX.Element>();
  expectTypeOf(invalid).toMatchTypeOf<React.JSX.Element>();
});
