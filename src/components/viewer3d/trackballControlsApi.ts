import { useCallback, type MutableRefObject } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type {
  TrackballControlsApi,
  TrackballControlsApiFields,
} from './trackballCameraLifecycleTypes';

export type { TrackballControlsApi } from './trackballCameraLifecycleTypes';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isBooleanRef(value: unknown): value is MutableRefObject<boolean> {
  return isObjectRecord(value) && typeof value.current === 'boolean';
}

function isEventDispatcher(value: unknown): value is THREE.EventDispatcher {
  return isObjectRecord(value) &&
    typeof value.addEventListener === 'function' &&
    typeof value.hasEventListener === 'function' &&
    typeof value.removeEventListener === 'function' &&
    typeof value.dispatchEvent === 'function';
}

export function createTrackballControlsApi(fields: TrackballControlsApiFields): TrackballControlsApi {
  return Object.assign(new THREE.EventDispatcher(), fields);
}

export function isTrackballControlsApi(value: unknown): value is TrackballControlsApi {
  if (!isObjectRecord(value) || !isEventDispatcher(value)) return false;

  const { enabled, dragging, wheelHandled, getCurrentViewState } = value;
  return (
    isBooleanRef(enabled) &&
    isBooleanRef(dragging) &&
    isBooleanRef(wheelHandled) &&
    typeof getCurrentViewState === 'function'
  );
}

export function getTrackballControlsApi(value: unknown): TrackballControlsApi | undefined {
  return isTrackballControlsApi(value) ? value : undefined;
}

export function isTrackballDragging(controls: Pick<TrackballControlsApi, 'dragging'> | null | undefined): boolean {
  return controls?.dragging.current ?? false;
}

export function setTrackballControlsEnabled(
  controls: Pick<TrackballControlsApi, 'enabled'> | null | undefined,
  enabled: boolean
): boolean {
  if (!controls) return false;

  controls.enabled.current = enabled;
  return true;
}

export function useTrackballControlsApi(): TrackballControlsApi | undefined {
  return useThree((state) => getTrackballControlsApi(state.controls));
}

export function useTrackballDraggingReader(): () => boolean {
  const controls = useTrackballControlsApi();
  return useCallback(() => isTrackballDragging(controls), [controls]);
}
