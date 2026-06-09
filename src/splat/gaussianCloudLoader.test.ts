import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearGaussianCloudLoadCacheForTests,
  getGaussianCloudFormatForFile,
  isGaussianCloudFile,
  loadGaussianCloudFromFile,
} from './gaussianCloudLoader';
import { createSh0OnlyGaussianCloud, validateGaussianCloud, type GaussianCloud } from './gaussianCloud';
import {
  getWebGpuSplatTelemetryEvents,
  resetWebGpuSplatTelemetryEventsForTests,
} from './webgpu/webGpuSplatTelemetry';
import {
  createPackedWebGpuGaussianCloud,
} from './webgpu/gaussianCloudPacking';
import type {
  GaussianCloudWorkerDecodeRequest,
  GaussianCloudWorkerResponse,
} from './gaussianCloudLoaderWorkerProtocol';

function makeCloud(count = 1): GaussianCloud {
  return {
    count,
    positions: new Float32Array(count * 3),
    scales: new Float32Array(count * 3).fill(1),
    rotations: new Float32Array(count * 4),
    opacities: new Float32Array(count).fill(0.5),
    sh0: new Float32Array(count * 3),
    shDegree: 0,
  };
}

function makeShCloud(count = 1): GaussianCloud {
  return {
    ...makeCloud(count),
    shDegree: 3,
    shN: new Float32Array(count * 15 * 3).fill(0.125),
  };
}

function makeBinaryPlyFile(): File {
  const properties = [
    'x', 'y', 'z',
    'f_dc_0', 'f_dc_1', 'f_dc_2',
    'opacity',
    'scale_0', 'scale_1', 'scale_2',
    'rot_0', 'rot_1', 'rot_2', 'rot_3',
  ];
  const header = [
    'ply',
    'format binary_little_endian 1.0',
    'element vertex 1',
    ...properties.map((property) => `property float ${property}`),
    'end_header',
    '',
  ].join('\n');
  const headerBytes = new TextEncoder().encode(header);
  const row = new ArrayBuffer(properties.length * 4);
  const view = new DataView(row);
  const values = [
    1, 2, 3,
    0.1, 0.2, 0.3,
    0,
    0, 0, 0,
    1, 0, 0, 0,
  ];
  values.forEach((value, index) => view.setFloat32(index * 4, value, true));

  return new File([headerBytes, row], 'tiny.ply');
}

function createFakeWorker(responseCloud: GaussianCloud): Worker {
  const worker = {
    onmessage: null as ((event: MessageEvent<GaussianCloudWorkerResponse>) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    terminate: vi.fn(),
    postMessage: vi.fn((request: GaussianCloudWorkerDecodeRequest) => {
      queueMicrotask(() => {
        worker.onmessage?.({
          data: {
            type: 'loaded',
            id: request.id,
            cloud: responseCloud,
            packed: {
              count: responseCloud.count,
              shDegree: responseCloud.shDegree,
              gaussianData: new Float32Array(responseCloud.count * 16),
              shData: responseCloud.shDegree > 0 && responseCloud.shN ? responseCloud.shN : null,
              bounds: {
                min: [0, 0, 0],
                max: [0, 0, 0],
                center: [0, 0, 0],
                size: 1,
              },
            },
          },
        } as MessageEvent<GaussianCloudWorkerResponse>);
      });
    }),
  };
  return worker as unknown as Worker;
}

describe('gaussian cloud loader', () => {
  beforeEach(() => {
    clearGaussianCloudLoadCacheForTests();
    resetWebGpuSplatTelemetryEventsForTests();
  });

  it('detects supported Gaussian cloud file formats', () => {
    expect(getGaussianCloudFormatForFile(new File(['x'], 'scene.SPZ'))).toBe('spz');
    expect(getGaussianCloudFormatForFile(new File(['x'], 'scene.ply'))).toBe('ply');
    expect(() => getGaussianCloudFormatForFile(new File(['x'], 'scene.splat')))
      .toThrow('Unsupported Gaussian splat format: scene.splat');
    expect(isGaussianCloudFile(new File(['x'], 'points3D.bin'))).toBe(false);
    expect(isGaussianCloudFile(new File(['x'], 'scene.ply'))).toBe(true);
    expect(isGaussianCloudFile(new File(['x'], 'scene.splat'))).toBe(false);
  });

  it('creates SH0-only views without mutating higher-order SH clouds', () => {
    const cloud = makeShCloud(2);
    const sh0Only = createSh0OnlyGaussianCloud(cloud);

    expect(sh0Only).not.toBe(cloud);
    expect(sh0Only.shDegree).toBe(0);
    expect(sh0Only.shN).toBeUndefined();
    expect(sh0Only.positions).toBe(cloud.positions);
    expect(sh0Only.sh0).toBe(cloud.sh0);
    expect(cloud.shDegree).toBe(3);
    expect(cloud.shN).toBeInstanceOf(Float32Array);
    expect(createSh0OnlyGaussianCloud(makeCloud())).toEqual(makeCloud());
  });

  it('routes SPZ and PLY files through format-specific loaders', async () => {
    const loadSPZFromBuffer = vi.fn(() => makeCloud(2));
    const loadPLYFromBuffer = vi.fn(() => makeCloud(3));

    await expect(loadGaussianCloudFromFile(new File(['spz'], 'scene.spz'), {
      loadSPZFromBuffer,
      loadPLYFromBuffer,
    })).resolves.toMatchObject({
      format: 'spz',
      byteLength: 3,
      cloud: { count: 2 },
    });
    await expect(loadGaussianCloudFromFile(new File(['ply'], 'scene.ply'), {
      loadSPZFromBuffer,
      loadPLYFromBuffer,
    })).resolves.toMatchObject({
      format: 'ply',
      byteLength: 3,
      cloud: { count: 3 },
    });

    expect(loadSPZFromBuffer).toHaveBeenCalledTimes(1);
    expect(loadPLYFromBuffer).toHaveBeenCalledTimes(1);
    expect(getWebGpuSplatTelemetryEvents()).toEqual([
      expect.objectContaining({
        name: 'gaussian-decode',
        bytes: 3,
        details: expect.objectContaining({
          fileName: 'scene.spz',
          format: 'spz',
          count: 2,
        }),
      }),
      expect.objectContaining({
        name: 'gaussian-decode',
        bytes: 3,
        details: expect.objectContaining({
          fileName: 'scene.ply',
          format: 'ply',
          count: 3,
        }),
      }),
    ]);
  });

  it('reports read and decode progress for large-file loading', async () => {
    const progress: string[] = [];
    const loadPLYFromBuffer = vi.fn(() => makeCloud(2));

    await loadGaussianCloudFromFile(new File(['ply-data'], 'scene.ply'), {
      loadPLYFromBuffer,
      onProgress: (event) => {
        progress.push(event.phase);
      },
    });

    expect(progress).toContain('reading');
    expect(progress).toContain('decoding');
    expect(progress).toContain('decoded');
  });

  it('reuses the decoded Gaussian cloud for repeated default loads of the same File', async () => {
    const file = makeBinaryPlyFile();

    const first = await loadGaussianCloudFromFile(file);
    const second = await loadGaussianCloudFromFile(file);

    expect(second).toBe(first);
    expect(getWebGpuSplatTelemetryEvents().filter((event) => event.name === 'gaussian-decode'))
      .toHaveLength(1);
  });

  it('does not cache injected loader calls', async () => {
    const file = new File(['ply'], 'scene.ply');
    const loadPLYFromBuffer = vi.fn()
      .mockReturnValueOnce(makeCloud(2))
      .mockReturnValueOnce(makeCloud(3));

    const first = await loadGaussianCloudFromFile(file, { loadPLYFromBuffer });
    const second = await loadGaussianCloudFromFile(file, { loadPLYFromBuffer });

    expect(first.cloud.count).toBe(2);
    expect(second.cloud.count).toBe(3);
    expect(loadPLYFromBuffer).toHaveBeenCalledTimes(2);
  });

  it('can decode through a worker and terminate it after loading', async () => {
    const cloud = makeCloud(4);
    const worker = createFakeWorker(cloud);

    const loaded = await loadGaussianCloudFromFile(new File(['ply'], 'scene.ply'), {
      createWorker: () => worker,
    });

    expect(loaded.cloud).toBe(cloud);
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'decode',
        format: 'ply',
      }),
      expect.any(Array)
    );
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('keeps worker-decoded higher-order SH in the packed upload cache', async () => {
    const cloud = makeShCloud(2);
    const worker = createFakeWorker(cloud);

    const loaded = await loadGaussianCloudFromFile(new File(['ply'], 'scene.ply'), {
      createWorker: () => worker,
    });
    const packed = createPackedWebGpuGaussianCloud(loaded.cloud);

    expect(loaded.cloud.shDegree).toBe(3);
    expect(loaded.cloud.shN?.byteLength).toBe(2 * 15 * 3 * Float32Array.BYTES_PER_ELEMENT);
    expect(packed.shDegree).toBe(3);
    expect(packed.shData).toBe(cloud.shN);
    expect(packed.shData?.byteLength).toBe(cloud.shN?.byteLength);
  });

  it('validates Gaussian cloud array dimensions', async () => {
    const invalid = {
      ...makeCloud(2),
      positions: new Float32Array(3),
    };

    await expect(loadGaussianCloudFromFile(new File(['x'], 'bad.spz'), {
      loadSPZFromBuffer: () => invalid,
    })).rejects.toThrow('Invalid Gaussian cloud positions length: expected 6, got 3');
  });

  it('validates higher-order SH array dimensions', () => {
    expect(() => validateGaussianCloud({
      ...makeCloud(1),
      shDegree: 1,
      shN: new Float32Array(1),
    })).toThrow('Invalid Gaussian cloud shN length: expected 9, got 1');
  });

  it('loads a tiny binary PLY through the gs-toolbox adapter', async () => {
    const loaded = await loadGaussianCloudFromFile(makeBinaryPlyFile());

    expect(loaded.format).toBe('ply');
    expect(loaded.cloud.count).toBe(1);
    expect(Array.from(loaded.cloud.positions)).toEqual([1, 2, 3]);
    expect(Array.from(loaded.cloud.scales)).toEqual([1, 1, 1]);
    expect(Array.from(loaded.cloud.rotations)).toEqual([1, 0, 0, 0]);
    expect(loaded.cloud.opacities[0]).toBeCloseTo(0.5);
  });
});
