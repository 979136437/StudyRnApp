import type { PropsWithChildren, ReactElement, ReactNode } from 'react';
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleProp,
  ViewStyle,
} from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

export interface InteractiveListScrollHandle {
  prepareForLayoutAnimationRender?: () => void;
  scrollToOffset: (params: { animated?: boolean; offset: number }) => void;
}

export interface InteractiveListActionInfo<T> {
  close: () => void;
  item: T;
  progress: SharedValue<number>;
  translation: SharedValue<number>;
}

export interface InteractiveListItemRenderInfo<T> {
  index: number;
  isDragging: boolean;
  item: T;
}

export interface InteractiveListItemProps<T> {
  children:
    | ReactNode
    | ((info: InteractiveListItemRenderInfo<T>) => ReactElement);
  index: number;
  item: T;
  renderLeftActions?: (info: InteractiveListActionInfo<T>) => ReactNode;
  renderRightActions?: (info: InteractiveListActionInfo<T>) => ReactNode;
}

export interface InteractiveListProviderProps<T> extends PropsWithChildren {
  autoScrollEdgeSize?: number;
  autoScrollMaxSpeed?: number;
  data: readonly T[];
  debug?: boolean;
  estimatedItemSize?: number;
  horizontalGestureTolerance?: number;
  keyExtractor: (item: T, index: number) => string;
  longPressDurationMs?: number;
  onReorder: (nextData: T[], fromIndex: number, toIndex: number) => void;
  style?: StyleProp<ViewStyle>;
}

export interface UseInteractiveListResult<T> {
  data: readonly T[];
  dragRenderDistance?: number;
  extraData: {
    activeKey?: string;
    commitRevision: number;
    offsets: Readonly<Record<string, number>>;
  };
  isDragging: boolean;
  keyExtractor: (item: T, index: number) => string;
  listRef: (handle: InteractiveListScrollHandle | null) => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollBeginDrag: () => void;
  scrollEventThrottle: 16;
}
