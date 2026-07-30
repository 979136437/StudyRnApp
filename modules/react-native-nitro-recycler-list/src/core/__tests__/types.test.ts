import type { SharedValue } from 'react-native-reanimated';
import { describe, expectTypeOf, it } from 'vitest';

import type {
  RecyclerGridListProps,
  RecyclerGroupedStickyListProps,
  RecyclerHorizontalListProps,
  RecyclerSecondLevelListProps,
} from '../../RecyclerList.presets';
import type { RefreshHeaderContext, RefreshPhase } from '../../types';

type TestItem = { id: string; group: string };

describe('refresh header context', () => {
  it('exposes Reanimated shared values for every animated field', () => {
    expectTypeOf<RefreshHeaderContext['offset']>().toEqualTypeOf<
      SharedValue<number>
    >();
    expectTypeOf<RefreshHeaderContext['progress']>().toEqualTypeOf<
      SharedValue<number>
    >();
    expectTypeOf<RefreshHeaderContext['phaseValue']>().toEqualTypeOf<
      SharedValue<RefreshPhase>
    >();
  });

  it('keeps generic item types in the preset components', () => {
    expectTypeOf<RecyclerGridListProps<TestItem>['data']>().toEqualTypeOf<
      readonly TestItem[]
    >();
    expectTypeOf<
      Parameters<RecyclerGroupedStickyListProps<TestItem>['getStickyGroup']>[0]
    >().toEqualTypeOf<TestItem>();
  });

  it('removes properties that conflict with fixed component behavior', () => {
    expectTypeOf<
      'layout' extends keyof RecyclerGridListProps<TestItem> ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      'horizontal' extends keyof RecyclerHorizontalListProps<TestItem>
        ? true
        : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      Record<string, never> extends Pick<
        RecyclerSecondLevelListProps<TestItem>,
        'secondLevel'
      >
        ? true
        : false
    >().toEqualTypeOf<false>();
  });
});
