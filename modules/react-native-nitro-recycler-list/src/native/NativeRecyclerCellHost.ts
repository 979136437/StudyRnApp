import { getHostComponent } from 'react-native-nitro-modules';

import RecyclerCellHostViewConfig from '../../nitrogen/generated/shared/json/RecyclerCellHostViewConfig.json';
import type {
  RecyclerCellHostViewMethods,
  RecyclerCellHostViewProps,
} from '../specs/RecyclerList.nitro';

export const NativeRecyclerCellHost = getHostComponent<
  RecyclerCellHostViewProps,
  RecyclerCellHostViewMethods
>('RecyclerCellHostView', () => RecyclerCellHostViewConfig);
