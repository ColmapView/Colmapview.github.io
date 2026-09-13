import type { SelectionColorMode } from '../../store/types';

/** Explicit continuous fallbacks. Extend demand rendering only after auditing a consumer. */
export interface SceneContinuousActivity {
  splat: boolean;
  recording: boolean;
  autoRotate: boolean;
  /** Configured image animation remains continuous before the first selection. */
  animatedSelection: boolean;
  animatedMatches: boolean;
  animatedRigs: boolean;
  floorPulse: boolean;
}

export function getSceneFrameloop(activity: SceneContinuousActivity): 'always' | 'demand' {
  return Object.values(activity).some(Boolean) ? 'always' : 'demand';
}

export function needsContinuousSelectionFrames(hasSelectableImages: boolean, mode: SelectionColorMode): boolean {
  return hasSelectableImages && (mode === 'blink' || mode === 'rainbow');
}

export interface TrackballRenderActivity {
  enabled: boolean;
  interacting: boolean;
  animating: boolean;
  keys: ReadonlySet<string>;
  angularVelocity: { x: number; y: number };
  minAngularVelocity: number;
  flyVelocityLength: number;
  orbitDistanceDelta: number;
  autoRotate: boolean;
}

const MOVEMENT_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', ' ']);

export function hasTrackballRenderActivity(activity: TrackballRenderActivity): boolean {
  if (!activity.enabled) return false;
  return activity.interacting || activity.animating || activity.autoRotate
    || [...activity.keys].some((key) => MOVEMENT_KEYS.has(key))
    || Math.abs(activity.angularVelocity.x) > activity.minAngularVelocity
    || Math.abs(activity.angularVelocity.y) > activity.minAngularVelocity
    || activity.flyVelocityLength > 0.0001
    || Math.abs(activity.orbitDistanceDelta) > 0.0001;
}

/** Reporting fields must never turn the FPS observer into a render producer. */
export function hasSceneStateChange<T extends object>(next: T, previous: T, ignored: readonly (keyof T)[] = []): boolean {
  return (Object.keys(next) as (keyof T)[]).some((key) => !ignored.includes(key) && next[key] !== previous[key]);
}
