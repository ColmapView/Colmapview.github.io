declare module '@local-gsplat-webgpu/renderer' {
  import type { GaussianCloud } from 'gs-toolbox';

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
    static readonly CAMERA_PINHOLE: number;
    static readonly CAMERA_ORTHO: number;
    static create(canvas: HTMLCanvasElement, options?: { gpuTiming?: boolean }): Promise<LocalGsplatRenderer>;
  }
}
