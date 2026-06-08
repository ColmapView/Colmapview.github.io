import type { WebGpuSplatFrameSnapshot } from './WebGpuSplatCanvasRuntime';

export function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export function sameWebGpuSplatCameraPose(
  a: WebGpuSplatFrameSnapshot,
  b: WebGpuSplatFrameSnapshot
): boolean {
  return sameNumberArray(a.camera.viewMatrix, b.camera.viewMatrix)
    && sameNumberArray(a.camera.worldMatrix, b.camera.worldMatrix)
    && sameNumberArray(a.camera.projectionMatrix, b.camera.projectionMatrix);
}

function sameNumberArray(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

// Resolve once the camera pose has been unchanged for `idleMs` (or on cancel).
export function waitForWebGpuSplatViewIdle(
  getLastFrameChangeMs: () => number,
  idleMs: number,
  isCancelled: () => boolean
): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (isCancelled()) {
        resolve();
        return;
      }
      const sinceChangeMs = nowMs() - getLastFrameChangeMs();
      if (sinceChangeMs >= idleMs) {
        resolve();
        return;
      }
      setTimeout(check, Math.max(16, idleMs - sinceChangeMs));
    };
    check();
  });
}
