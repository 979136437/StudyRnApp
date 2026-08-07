import {
  DEFAULT_COLUMNS,
  DEFAULT_SELECTION_LIMIT,
  MAX_COLUMNS,
  MAX_PAGE_SIZE,
  MIN_COLUMNS,
} from '../core/constants';
import { normalizeInteger } from '../core/normalize-integer';
import { NitroImagePickerError } from '../types';

export function normalizePickerUiOptions(options: {
  columns?: number;
  selectionLimit?: number;
}): { columns: number; selectionLimit: number } {
  try {
    return {
      columns: normalizeInteger(
        options.columns,
        DEFAULT_COLUMNS,
        MIN_COLUMNS,
        MAX_COLUMNS,
        'columns',
      ),
      selectionLimit: normalizeInteger(
        options.selectionLimit,
        DEFAULT_SELECTION_LIMIT,
        1,
        MAX_PAGE_SIZE,
        'selectionLimit',
      ),
    };
  } catch (error) {
    throw new NitroImagePickerError(
      'E_INVALID_OPTIONS',
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? { cause: error } : undefined,
    );
  }
}
