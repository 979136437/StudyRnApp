import { FlashListProps } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ISIOS } from '@/constant';

export type ListSafeAreaProps = Pick<
  FlashListProps<any>,
  'contentContainerStyle' | 'style'
>;

export function useListSafeArea(props?: ListSafeAreaProps) {
  const insets = useSafeAreaInsets();
  return {
    overScrollMode: 'never',
    contentContainerStyle: {
      ...props?.contentContainerStyle,
      ...(ISIOS ? { paddingBlockEnd: insets.bottom } : {}),
    },
    style: {
      ...props?.style,
      ...(!ISIOS ? { marginBlockEnd: insets.bottom } : {}),
    },
  } as ListSafeAreaProps;
}
