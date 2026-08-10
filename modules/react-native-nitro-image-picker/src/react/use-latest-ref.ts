import { useLayoutEffect, useRef } from 'react';

export function useLatestRef<T>(value: T): React.RefObject<T> {
  const valueRef = useRef(value);
  useLayoutEffect(() => {
    valueRef.current = value;
  }, [value]);
  return valueRef;
}
