import { useLayoutEffect, useRef, type MutableRefObject } from 'react';

export function useLatestRef<T>(value: T): MutableRefObject<T> {
  const valueRef = useRef(value);

  useLayoutEffect(() => {
    valueRef.current = value;
  });

  return valueRef;
}
