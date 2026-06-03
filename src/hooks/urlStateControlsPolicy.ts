import type { CameraViewState } from '../store/types';

function hasCurrentViewStateReader(value: unknown): value is {
  getCurrentViewState: () => CameraViewState;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getCurrentViewState' in value &&
    typeof value.getCurrentViewState === 'function'
  );
}

/**
 * Get current camera view state from the R3F controls object used by URL sharing.
 */
export function getControlsViewState(controls: unknown): CameraViewState | null {
  if (!hasCurrentViewStateReader(controls)) return null;
  return controls.getCurrentViewState();
}
