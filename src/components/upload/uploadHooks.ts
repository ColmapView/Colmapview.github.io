import { useCallback, useEffect, useRef, useState } from 'react';

/** Moves focus to the element with this id when `flag` turns true, such as the first field once sign-in completes. */
export function useFocusWhenBecomesTrue(flag: boolean, elementId: string): void {
  const previous = useRef(flag);
  useEffect(() => {
    if (flag && !previous.current) document.getElementById(elementId)?.focus();
    previous.current = flag;
  }, [flag, elementId]);
}

/**
 * A form value whose edit applies only to the dataset it was made for: upload dialogs stay mounted across
 * loads, so another dataset shows `fallback` again.
 */
export function useDatasetScopedValue(sourceKey: string, fallback: string): [string, (value: string) => void] {
  const [edit, setEdit] = useState<{ key: string; value: string } | null>(null);
  const setValue = useCallback((value: string) => setEdit({ key: sourceKey, value }), [sourceKey]);
  return [edit?.key === sourceKey ? edit.value : fallback, setValue];
}

/** A ref whose element takes focus when it mounts, such as a status line that replaces the form. */
export function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return ref;
}
