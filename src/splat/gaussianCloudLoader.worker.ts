import {
  loadPLYFromBuffer,
  loadSPZFromBuffer,
} from 'gs-toolbox';
import { validateGaussianCloud, type GaussianCloud } from './gaussianCloud';
import {
  createPackedWebGpuGaussianCloud,
  type PackedWebGpuGaussianCloud,
} from './webgpu/gaussianCloudPacking';
import type {
  GaussianCloudWorkerDecodeRequest,
  GaussianCloudWorkerLoadedResponse,
  GaussianCloudWorkerResponse,
} from './gaussianCloudLoaderWorkerProtocol';

type GaussianCloudLoaderWorkerGlobal = {
  onmessage: ((event: MessageEvent<GaussianCloudWorkerDecodeRequest>) => void) | null;
  postMessage: (message: GaussianCloudWorkerResponse, transfer?: Transferable[]) => void;
};

const workerSelf = self as unknown as GaussianCloudLoaderWorkerGlobal;

workerSelf.onmessage = (event: MessageEvent<GaussianCloudWorkerDecodeRequest>) => {
  const request = event.data;
  if (request.type !== 'decode') {
    return;
  }

  try {
    const cloud = request.format === 'spz'
      ? loadSPZFromBuffer(request.buffer)
      : loadPLYFromBuffer(request.buffer);
    validateGaussianCloud(cloud);
    const packed = createPackedWebGpuGaussianCloud(cloud);
    const response: GaussianCloudWorkerLoadedResponse = {
      type: 'loaded',
      id: request.id,
      cloud,
      packed,
    };
    workerSelf.postMessage(response, collectTransferList(cloud, packed));
  } catch (error) {
    workerSelf.postMessage({
      type: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    } satisfies GaussianCloudWorkerResponse);
  }
};

function collectTransferList(
  cloud: GaussianCloud,
  packed: PackedWebGpuGaussianCloud
): Transferable[] {
  const buffers = new Set<ArrayBuffer>();
  addFloat32ArrayBuffer(buffers, cloud.positions);
  addFloat32ArrayBuffer(buffers, cloud.scales);
  addFloat32ArrayBuffer(buffers, cloud.rotations);
  addFloat32ArrayBuffer(buffers, cloud.opacities);
  addFloat32ArrayBuffer(buffers, cloud.sh0);
  addFloat32ArrayBuffer(buffers, cloud.shN);
  addFloat32ArrayBuffer(buffers, packed.gaussianData);
  addFloat32ArrayBuffer(buffers, packed.shData);
  return Array.from(buffers);
}

function addFloat32ArrayBuffer(
  buffers: Set<ArrayBuffer>,
  value: Float32Array | null | undefined
): void {
  if (value?.buffer instanceof ArrayBuffer) {
    buffers.add(value.buffer);
  }
}
