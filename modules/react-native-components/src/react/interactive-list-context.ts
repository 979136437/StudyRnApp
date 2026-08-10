import { createContext, use } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SharedValue } from 'react-native-reanimated';

import type { InteractiveListScrollHandle } from '../components/InteractiveList/types';

export interface InteractiveListContextValue {
  activeKey?: string;
  activeTargetOffset: SharedValue<number>;
  activeTranslation: SharedValue<number>;
  commitRevision: number;
  data: readonly unknown[];
  dragRenderDistance?: number;
  getItemKey: (item: unknown, index: number) => string;
  getItemOffset: (index: number) => number;
  getItemTargetOffset: (key: string) => number;
  horizontalGestureTolerance: number;
  layoutRevision: number;
  longPressDurationMs: number;
  onDragCancel: (key: string) => void;
  onDragMove: (key: string, center: number, absoluteY: number) => void;
  onDragStart: (key: string, index: number) => void;
  onDrop: (key: string) => void;
  onItemLayout: (key: string, length: number) => void;
  onRegisterSwipeable: (key: string, methods: SwipeableMethods | null) => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollBeginDrag: () => void;
  onSwipeableClose: (key: string) => void;
  onSwipeableWillOpen: (key: string) => void;
  offsets: Readonly<Record<string, number>>;
  scrollOffset: SharedValue<number>;
  setListRef: (handle: InteractiveListScrollHandle | null) => void;
}

export const InteractiveListContext =
  createContext<InteractiveListContextValue | null>(null);

export function useInteractiveListContext(): InteractiveListContextValue {
  const context = use(InteractiveListContext);
  if (!context) {
    throw new Error(
      'InteractiveListItem 与 useInteractiveList 必须位于 InteractiveListProvider 内部。',
    );
  }
  return context;
}
