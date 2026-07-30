import type { SharedValue } from 'react-native-reanimated';
import { describe, expectTypeOf, it } from 'vitest';

import type { RefreshHeaderContext, RefreshPhase } from '../../types';

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
});
