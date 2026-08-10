export interface SelectionAsset {
  assetId?: string;
  uri: string;
  type: 'image' | 'video';
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  width: number;
  height: number;
  duration?: number;
}

export interface PickerSelectionState {
  selectedIds: string[];
  capturedAssets: Record<string, SelectionAsset>;
}

export type PickerSelectionAction =
  | { type: 'toggle'; assetId: string; limit: number }
  | { type: 'capture'; asset: SelectionAsset; limit: number }
  | { type: 'replace'; assetIds: string[]; limit: number }
  | { type: 'remove-missing'; availableIds: Set<string> }
  | { type: 'reset'; assetIds: string[] };

export function createSelectionState(
  assetIds: string[] = [],
): PickerSelectionState {
  return { selectedIds: [...new Set(assetIds)], capturedAssets: {} };
}

export function selectionReducer(
  state: PickerSelectionState,
  action: PickerSelectionAction,
): PickerSelectionState {
  switch (action.type) {
    case 'toggle': {
      const selectedIndex = state.selectedIds.indexOf(action.assetId);
      if (selectedIndex >= 0) {
        return {
          ...state,
          selectedIds: state.selectedIds.filter((id) => id !== action.assetId),
        };
      }
      if (state.selectedIds.length >= action.limit) return state;
      return { ...state, selectedIds: [...state.selectedIds, action.assetId] };
    }
    case 'capture': {
      if (state.selectedIds.length >= action.limit) return state;
      const assetId = action.asset.assetId ?? `capture:${action.asset.uri}`;
      return {
        selectedIds: [...state.selectedIds, assetId],
        capturedAssets: { ...state.capturedAssets, [assetId]: action.asset },
      };
    }
    case 'replace':
      return {
        ...state,
        selectedIds: [...new Set(action.assetIds)].slice(0, action.limit),
      };
    case 'remove-missing':
      return {
        ...state,
        selectedIds: state.selectedIds.filter(
          (id) => id in state.capturedAssets || action.availableIds.has(id),
        ),
      };
    case 'reset':
      return createSelectionState(action.assetIds);
  }
}

export function getSelectionIndex(
  state: PickerSelectionState,
  assetId: string,
): number {
  const index = state.selectedIds.indexOf(assetId);
  return index < 0 ? 0 : index + 1;
}

export function mergeResolvedSelection(
  state: PickerSelectionState,
  resolved: SelectionAsset[],
): SelectionAsset[] {
  const resolvedById = new Map(
    resolved.flatMap((asset) =>
      asset.assetId ? [[asset.assetId, asset] as const] : [],
    ),
  );
  return state.selectedIds.flatMap((id) => {
    const asset = state.capturedAssets[id] ?? resolvedById.get(id);
    return asset ? [asset] : [];
  });
}
