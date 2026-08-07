import { describe, expect, it } from 'vitest';

import {
  normalizeAssetOptions,
  normalizeCameraOptions,
  normalizeImagePickerOptions,
  normalizeMediaTypes,
} from '../api/normalize-options';
import { normalizePickerUiOptions } from '../components/normalize-picker-options';

describe('picker options', () => {
  it('uses stable media and UI defaults', () => {
    expect(normalizeMediaTypes()).toEqual(['images', 'videos']);
    expect(normalizePickerUiOptions({})).toEqual({
      columns: 4,
      selectionLimit: 9,
    });
  });

  it('deduplicates media types and clamps pagination', () => {
    expect(normalizeMediaTypes(['images', 'images', 'videos'])).toEqual([
      'images',
      'videos',
    ]);
    expect(normalizeAssetOptions({ first: 1000 }).first).toBe(200);
  });

  it('uses a 60-item page and keeps an opaque cursor unchanged', () => {
    expect(normalizeAssetOptions()).toMatchObject({
      first: 60,
      after: undefined,
    });
    expect(normalizeAssetOptions({ after: 'opaque:cursor' }).after).toBe(
      'opaque:cursor',
    );
  });

  it('clamps UI dimensions and selection limits', () => {
    expect(
      normalizePickerUiOptions({ columns: 99, selectionLimit: 999 }),
    ).toEqual({
      columns: 6,
      selectionLimit: 200,
    });
    expect(
      normalizePickerUiOptions({ columns: -1, selectionLimit: 0 }),
    ).toEqual({
      columns: 2,
      selectionLimit: 1,
    });
  });

  it('forces single-selection requests to one result', () => {
    expect(
      normalizeImagePickerOptions({
        allowsMultipleSelection: false,
        selectionLimit: 9,
      }).selectionLimit,
    ).toBe(1);
  });

  it('rejects non-finite values', () => {
    expect(() => normalizeAssetOptions({ first: Number.NaN })).toThrow('first');
    expect(() => normalizeCameraOptions({ videoMaxDuration: -1 })).toThrow(
      'videoMaxDuration',
    );
  });

  it('rejects unknown media filters defensively', () => {
    expect(() => normalizeMediaTypes(['audio' as never])).toThrow('mediaTypes');
  });
});
