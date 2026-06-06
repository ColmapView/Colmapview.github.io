import * as THREE from 'three';
import {
  createWebGpuSplatFrameFromThreeCamera,
  createWebGpuSplatViewportFrame,
  type WebGpuSplatCameraFrame,
} from '../../splat/webgpu/cameraFrames';

export type WebGpuSplatViewportSnapshot = WebGpuSplatCameraFrame['viewport'];
export type WebGpuSplatCameraSnapshot = WebGpuSplatCameraFrame['camera'];
export type WebGpuSplatFrameSnapshot = WebGpuSplatCameraFrame;

export interface WebGpuSplatCanvasHost {
  canvas: HTMLCanvasElement;
  setFrameSnapshot: (snapshot: WebGpuSplatFrameSnapshot) => void;
}

let activeHost: WebGpuSplatCanvasHost | null = null;

export function registerWebGpuSplatCanvasHost(host: WebGpuSplatCanvasHost): () => void {
  activeHost = host;
  return () => {
    if (activeHost === host) {
      activeHost = null;
    }
  };
}

export function syncWebGpuSplatFrameSnapshot(snapshot: WebGpuSplatFrameSnapshot): void {
  activeHost?.setFrameSnapshot(snapshot);
}

export function getActiveWebGpuSplatCanvasHost(): WebGpuSplatCanvasHost | null {
  return activeHost;
}

export function createWebGpuSplatViewportSnapshot(
  width: number,
  height: number,
  dpr: number
): WebGpuSplatViewportSnapshot {
  return createWebGpuSplatViewportFrame(width, height, dpr);
}

export function resizeWebGpuSplatCanvas(
  canvas: HTMLCanvasElement,
  viewport: WebGpuSplatViewportSnapshot
): boolean {
  let changed = false;
  if (canvas.width !== viewport.pixelWidth) {
    canvas.width = viewport.pixelWidth;
    changed = true;
  }
  if (canvas.height !== viewport.pixelHeight) {
    canvas.height = viewport.pixelHeight;
    changed = true;
  }

  const cssWidth = `${viewport.cssWidth}px`;
  const cssHeight = `${viewport.cssHeight}px`;
  if (canvas.style.width !== cssWidth) {
    canvas.style.width = cssWidth;
    changed = true;
  }
  if (canvas.style.height !== cssHeight) {
    canvas.style.height = cssHeight;
    changed = true;
  }

  return changed;
}

export function createWebGpuSplatCameraSnapshot(
  camera: THREE.Camera,
  modelMatrix?: THREE.Matrix4 | null
): WebGpuSplatCameraSnapshot {
  return createWebGpuSplatFrameFromThreeCamera({
    camera,
    width: 1,
    height: 1,
    dpr: 1,
    modelMatrix,
  }).camera;
}

export function createWebGpuSplatFrameSnapshot({
  camera,
  width,
  height,
  dpr,
  modelMatrix,
}: {
  camera: THREE.Camera;
  width: number;
  height: number;
  dpr: number;
  modelMatrix?: THREE.Matrix4 | null;
}): WebGpuSplatFrameSnapshot {
  return createWebGpuSplatFrameFromThreeCamera({ camera, width, height, dpr, modelMatrix });
}
