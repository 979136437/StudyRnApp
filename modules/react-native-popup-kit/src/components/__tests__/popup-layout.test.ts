import { describe, expect, it } from 'vitest';

import { getPopupAlignment, getPopupSize } from '../popup-layout';

describe('popup layout', () => {
  it('uses full width and capped height for vertical modes', () => {
    expect(getPopupSize('top')).toEqual({ maxHeight: '75%', width: '100%' });
    expect(getPopupSize('bottom')).toEqual({ maxHeight: '75%', width: '100%' });
    expect(getPopupAlignment('top')).toEqual({ justifyContent: 'flex-start' });
    expect(getPopupAlignment('bottom')).toEqual({ justifyContent: 'flex-end' });
  });

  it('uses full height and capped width for horizontal modes', () => {
    expect(getPopupSize('left')).toEqual({ height: '100%', maxWidth: '85%' });
    expect(getPopupSize('right')).toEqual({ height: '100%', maxWidth: '85%' });
    expect(getPopupAlignment('left')).toEqual({ alignItems: 'flex-start' });
    expect(getPopupAlignment('right')).toEqual({ alignItems: 'flex-end' });
  });

  it('supports center and fullscreen sizing', () => {
    expect(getPopupSize('center')).toEqual({
      maxHeight: '85%',
      maxWidth: '85%',
    });
    expect(getPopupSize('fullscreen')).toEqual({
      height: '100%',
      width: '100%',
    });
    expect(getPopupAlignment('center')).toEqual({
      alignItems: 'center',
      justifyContent: 'center',
    });
  });
});
