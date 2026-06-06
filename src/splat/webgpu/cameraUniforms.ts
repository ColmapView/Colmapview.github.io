export interface WebGpuSplatUniformViewport {
  pixelWidth: number;
  pixelHeight: number;
}

export interface WebGpuSplatUniformCamera {
  kind: 'perspective' | 'orthographic' | 'unknown';
  viewMatrix: ArrayLike<number>;
  projectionMatrix: ArrayLike<number>;
  position: [number, number, number];
  near: number | null;
  far: number | null;
}

export interface WebGpuSplatUniformFrame {
  viewport: WebGpuSplatUniformViewport;
  camera: WebGpuSplatUniformCamera;
}
