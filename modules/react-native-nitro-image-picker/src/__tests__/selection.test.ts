import { describe, expect, it } from 'vitest';

import {
  createSelectionState,
  getSelectionIndex,
  mergeResolvedSelection,
  selectionReducer,
} from '../core/selection';

const captured = {
  uri: 'file:///capture.jpg',
  type: 'image' as const,
  width: 100,
  height: 100,
};

describe('picker selection', () => {
  it('preserves order and enforces the limit', () => {
    let state = createSelectionState();
    state = selectionReducer(state, { type: 'toggle', assetId: 'a', limit: 2 });
    state = selectionReducer(state, { type: 'toggle', assetId: 'b', limit: 2 });
    state = selectionReducer(state, { type: 'toggle', assetId: 'c', limit: 2 });
    expect(state.selectedIds).toEqual(['a', 'b']);
    expect(getSelectionIndex(state, 'b')).toBe(2);
  });

  it('deselects without changing the remaining order', () => {
    const state = selectionReducer(createSelectionState(['a', 'b']), {
      type: 'toggle',
      assetId: 'a',
      limit: 9,
    });
    expect(state.selectedIds).toEqual(['b']);
  });

  it('adds captures and merges them with resolved assets', () => {
    let state = createSelectionState(['library']);
    state = selectionReducer(state, {
      type: 'capture',
      asset: captured,
      limit: 9,
    });
    expect(
      mergeResolvedSelection(state, [{ ...captured, assetId: 'library' }]),
    ).toEqual([{ ...captured, assetId: 'library' }, captured]);
  });

  it('does not add a capture after reaching the selection limit', () => {
    const original = createSelectionState(['library']);
    const state = selectionReducer(original, {
      type: 'capture',
      asset: captured,
      limit: 1,
    });
    expect(state).toBe(original);
  });

  it('deduplicates replacement order and removes deleted library assets', () => {
    let state = selectionReducer(createSelectionState(), {
      type: 'replace',
      assetIds: ['a', 'a', 'b', 'c'],
      limit: 2,
    });
    state = selectionReducer(state, {
      type: 'remove-missing',
      availableIds: new Set(['b']),
    });
    expect(state.selectedIds).toEqual(['b']);
  });

  it('keeps selection state intact when a resolved asset is missing', () => {
    const state = createSelectionState(['available', 'deleted']);
    const merged = mergeResolvedSelection(state, [
      { ...captured, assetId: 'available' },
    ]);
    expect(merged).toHaveLength(1);
    expect(state.selectedIds).toEqual(['available', 'deleted']);
  });
});
