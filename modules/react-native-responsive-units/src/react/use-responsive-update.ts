import { useContext } from 'react';

import { ResponsiveContext } from './responsive-context';

export function useResponsiveUpdate(): void {
  const runtime = useContext(ResponsiveContext);

  if (runtime === null) {
    throw new Error(
      'useResponsiveUpdate must be used inside a ResponsiveProvider.',
    );
  }
}
