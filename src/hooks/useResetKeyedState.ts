import { useCallback, useReducer, type Dispatch, type SetStateAction } from 'react';

interface ResetKeyedState<T> {
  resetKey: unknown;
  value: T;
}

type ResetKeyedAction<T> =
  | { type: 'reset'; resetKey: unknown; value: T }
  | { type: 'set'; action: SetStateAction<T> };

function resolveSetStateAction<T>(action: SetStateAction<T>, previousValue: T): T {
  return typeof action === 'function'
    ? (action as (previous: T) => T)(previousValue)
    : action;
}

function resetKeyedStateReducer<T>(
  state: ResetKeyedState<T>,
  action: ResetKeyedAction<T>
): ResetKeyedState<T> {
  if (action.type === 'reset') {
    return {
      resetKey: action.resetKey,
      value: action.value,
    };
  }

  return {
    ...state,
    value: resolveSetStateAction(action.action, state.value),
  };
}

export function useResetKeyedState<T>(
  resetKey: unknown,
  initialValue: T
): [T, Dispatch<SetStateAction<T>>] {
  const [state, dispatch] = useReducer(resetKeyedStateReducer<T>, {
    resetKey,
    value: initialValue,
  });

  const setValue = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    dispatch({ type: 'set', action });
  }, []);

  if (!Object.is(state.resetKey, resetKey)) {
    dispatch({ type: 'reset', resetKey, value: initialValue });
    return [initialValue, setValue];
  }

  return [state.value, setValue];
}
