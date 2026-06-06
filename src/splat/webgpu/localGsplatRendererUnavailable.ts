import type { GaussianCloud } from '../gaussianCloud';

export interface LocalGsplatOrbitCamera {
  position: Float32Array;
  target: Float32Array;
  up: Float32Array;
  fov: number;
  near: number;
  far: number;
  aspect: number;
}

export interface LocalGsplatRenderer {
  loadGaussians: (cloud: GaussianCloud, options?: { fitCamera?: boolean }) => void;
  render: () => void;
  resize: (width: number, height: number) => void;
  destroy: () => void;
  getCamera: () => LocalGsplatOrbitCamera;
  setCameraModel?: (model: number) => void;
  setBackgroundColor?: (r: number, g: number, b: number) => void;
  setFov?: (degrees: number) => void;
  setDepthRange?: (nearPlane: number | null, farPlane: number | null) => void;
}

export class GaussianRenderer {
  static readonly CAMERA_PINHOLE = 0;
  static readonly CAMERA_ORTHO = 1;

  static async create(): Promise<LocalGsplatRenderer> {
    throw new Error(
      'Experimental local gsplat WebGPU renderer is disabled. '
      + 'Set VITE_ENABLE_LOCAL_GSPLAT_WEBGPU=1 and provide the local gsplat checkout to enable it.'
    );
  }
}
