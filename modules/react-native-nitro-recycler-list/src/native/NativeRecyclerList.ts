import { getHostComponent } from 'react-native-nitro-modules';

import RecyclerListViewConfig from '../../nitrogen/generated/shared/json/RecyclerListViewConfig.json';
import type {
  RecyclerListViewMethods,
  RecyclerListViewProps,
} from '../specs/RecyclerList.nitro';

export const NativeRecyclerList = getHostComponent<
  RecyclerListViewProps,
  RecyclerListViewMethods
>('RecyclerListView', () => RecyclerListViewConfig);
