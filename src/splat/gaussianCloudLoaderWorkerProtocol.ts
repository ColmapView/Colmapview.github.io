import type { GaussianCloud, GaussianCloudFormat } from './gaussianCloud';
import type { PackedWebGpuGaussianCloud } from './webgpu/gaussianCloudPacking';

export interface GaussianCloudWorkerDecodeRequest {
  type: 'decode';
  id: number;
  format: GaussianCloudFormat;
  buffer: ArrayBuffer;
}

export interface GaussianCloudWorkerLoadedResponse {
  type: 'loaded';
  id: number;
  cloud: GaussianCloud;
  packed: PackedWebGpuGaussianCloud;
}

export interface GaussianCloudWorkerErrorResponse {
  type: 'error';
  id: number;
  message: string;
  stack?: string;
}

export type GaussianCloudWorkerResponse =
  | GaussianCloudWorkerLoadedResponse
  | GaussianCloudWorkerErrorResponse;
