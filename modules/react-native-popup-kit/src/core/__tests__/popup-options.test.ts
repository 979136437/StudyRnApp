import { describe, expect, it } from 'vitest';

import { PopupDisplayMode, PopupMode } from '../../constants';
import { resolvePopupOptions } from '../popup-options';

describe('resolvePopupOptions', () => {
  it('applies the documented defaults', () => {
    const options = resolvePopupOptions({ children: 'content' });
    expect(options).toMatchObject({
      closeOnClickOverlay: true,
      displayMode: PopupDisplayMode.QUEUE,
      duration: 300,
      mode: PopupMode.CENTER,
      overlay: true,
    });
    expect(options.id).toMatch(/^popup-/);
  });

  it('preserves every explicit option', () => {
    const options = resolvePopupOptions({
      children: 'content',
      closeOnClickOverlay: false,
      displayMode: PopupDisplayMode.STACK,
      duration: 120,
      id: 'custom',
      mode: PopupMode.LEFT,
      overlay: false,
      overlayContent: 'custom overlay',
      overlayStyle: { backgroundColor: '#0008' },
      popupStyle: { backgroundColor: '#fff' },
    });
    expect(options).toMatchObject({
      closeOnClickOverlay: false,
      displayMode: PopupDisplayMode.STACK,
      duration: 120,
      id: 'custom',
      mode: PopupMode.LEFT,
      overlay: false,
      overlayContent: 'custom overlay',
      overlayStyle: { backgroundColor: '#0008' },
      popupStyle: { backgroundColor: '#fff' },
    });
  });

  it('normalizes unsafe durations and blank ids', () => {
    expect(
      resolvePopupOptions({ children: null, duration: -10 }).duration,
    ).toBe(0);
    expect(
      resolvePopupOptions({ children: null, duration: Number.NaN }).duration,
    ).toBe(300);
    expect(resolvePopupOptions({ children: null, id: '   ' }).id).toMatch(
      /^popup-/,
    );
  });
});
