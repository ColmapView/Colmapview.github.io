import type { AutoRotateMode } from '../../store/types';

export interface XYVelocity {
  x: number;
  y: number;
}

export interface OrbitDistanceStep {
  distance: number;
  changed: boolean;
}

export function getCappedFrameDeltaMs(now: number, lastFrameTime: number, maxDeltaMs: number): number {
  return Math.min(now - lastFrameTime, maxDeltaMs);
}

export function getFrameDamping(baseDamping: number, frameDeltaMs: number, frameTimeMs: number): number {
  return Math.pow(baseDamping, frameDeltaMs / frameTimeMs);
}

export function shouldApplyAngularVelocity(velocity: XYVelocity, minVelocity: number): boolean {
  return Math.abs(velocity.x) > minVelocity || Math.abs(velocity.y) > minVelocity;
}

export function getOrbitDistanceStep(
  currentDistance: number,
  targetDistance: number,
  threshold: number,
  transitionFactor: number
): OrbitDistanceStep {
  if (Math.abs(targetDistance - currentDistance) <= threshold) {
    return { distance: currentDistance, changed: false };
  }

  return {
    distance: currentDistance + (targetDistance - currentDistance) * transitionFactor,
    changed: true,
  };
}

export function getAutoRotateDelta(mode: AutoRotateMode, speed: number, frameDeltaMs: number): number {
  if (mode === 'off') return 0;

  const direction = mode === 'cw' ? 1 : -1;
  return direction * speed * (frameDeltaMs / 1000);
}
