export type WebGpuSplatBackgroundColor = [number, number, number, number];

export const WEBGPU_SPLAT_OPAQUE_BLACK_BACKGROUND = [0, 0, 0, 1] as const;

export function getWebGpuSplatDefaultBackgroundColor(): WebGpuSplatBackgroundColor {
  return [...WEBGPU_SPLAT_OPAQUE_BLACK_BACKGROUND];
}
