import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  accumulatePsnrTextureReductions,
  computePsnrFromRgbaTexturesWebGpu,
  computePsnrFromTextureReduction,
  computePsnrTextureReductionFromRgbaTexturesWebGpu,
} from './psnrTextureCompute';
import {
  getWebGpuSplatDebugCounters,
  resetWebGpuSplatDebugCountersForTests,
} from './webGpuSplatDebugCounters';
import {
  getWebGpuSplatTelemetryEvents,
  resetWebGpuSplatTelemetryEventsForTests,
} from './webGpuSplatTelemetry';

function makeTexture() {
  return {
    createView: vi.fn(() => ({ kind: 'texture-view' })),
  } as unknown as GPUTexture;
}

function makeFakeDevice(
  readback: number[] | number[][],
  limits: Partial<GPUSupportedLimits> = {}
) {
  const readbacks = Array.isArray(readback[0])
    ? readback as number[][]
    : [readback as number[]];
  let readbackIndex = 0;
  const dispatches: Array<[number, number | undefined, number | undefined]> = [];
  const shaderCodes: string[] = [];
  const bindGroups: GPUBindGroupDescriptor[] = [];
  const bufferDescriptors: GPUBufferDescriptor[] = [];
  const writeBuffers: ArrayBuffer[] = [];
  const copySizes: number[] = [];
  const pass = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    dispatchWorkgroups: vi.fn((x: number, y?: number, z?: number) => dispatches.push([x, y, z])),
    end: vi.fn(),
  };
  const commandEncoder = {
    beginComputePass: vi.fn(() => pass),
    copyBufferToBuffer: vi.fn((
      _source: GPUBuffer,
      _sourceOffset: number,
      _destination: GPUBuffer,
      _destinationOffset: number,
      size: number
    ) => copySizes.push(size)),
    finish: vi.fn(() => ({ kind: 'command-buffer' } as unknown as GPUCommandBuffer)),
  };
  const readbackBuffer = {
    mapAsync: vi.fn().mockResolvedValue(undefined),
    getMappedRange: vi.fn(() => {
      const selected = readbacks[Math.min(readbackIndex, readbacks.length - 1)];
      readbackIndex += 1;
      return new Uint32Array(selected).buffer;
    }),
    unmap: vi.fn(),
    destroy: vi.fn(),
  } as unknown as GPUBuffer;
  const device = {
    limits: limits as GPUSupportedLimits,
    createShaderModule: vi.fn(({ code }: GPUShaderModuleDescriptor) => {
      shaderCodes.push(code);
      return { kind: 'shader-module' } as unknown as GPUShaderModule;
    }),
    createComputePipeline: vi.fn(() => ({
      getBindGroupLayout: vi.fn(() => ({ kind: 'layout' } as unknown as GPUBindGroupLayout)),
    } as unknown as GPUComputePipeline)),
    createBuffer: vi.fn((descriptor: GPUBufferDescriptor) => {
      bufferDescriptors.push(descriptor);
      if ((descriptor.usage & 0x0001) !== 0) {
        return readbackBuffer;
      }
      return {
        destroy: vi.fn(),
      } as unknown as GPUBuffer;
    }),
    createBindGroup: vi.fn((descriptor: GPUBindGroupDescriptor) => {
      bindGroups.push(descriptor);
      return { kind: 'bind-group' } as unknown as GPUBindGroup;
    }),
    createCommandEncoder: vi.fn(() => commandEncoder),
    queue: {
      writeBuffer: vi.fn((_buffer: GPUBuffer, _offset: number, data: BufferSource) => {
        writeBuffers.push(data instanceof ArrayBuffer ? data : data.buffer.slice(0));
      }),
      submit: vi.fn(),
    },
  } as unknown as GPUDevice;

  return {
    bindGroups,
    bufferDescriptors,
    commandEncoder,
    copySizes,
    device,
    dispatches,
    pass,
    readbackBuffer,
    shaderCodes,
    writeBuffers,
  };
}

function metricReadback(
  sumSquaredError: number,
  validPixelCount: number,
  ssim = 1,
  ssimWindowCount = validPixelCount
): number[] {
  const ssimScaledSum = ssimWindowCount > 0
    ? Math.round((ssim + 1) * 500_000 * ssimWindowCount)
    : 0;
  return [
    sumSquaredError, 0,
    validPixelCount, 0,
    ssimScaledSum, 0,
    ssimWindowCount, 0,
  ];
}

describe('WebGPU PSNR texture compute', () => {
  beforeEach(() => {
    resetWebGpuSplatDebugCountersForTests();
    resetWebGpuSplatTelemetryEventsForTests();
  });

  it('computes PSNR from RGB 8-bit squared error using channel-count MSE', () => {
    expect(computePsnrFromTextureReduction({
      sumSquaredError: 0,
      validPixelCount: 12,
    })).toMatchObject({
      psnr: Infinity,
      mse: 0,
      validPixelCount: 12,
    });

    const oneHundredMsePerChannel = computePsnrFromTextureReduction({
      sumSquaredError: 100 * 12 * 3,
      validPixelCount: 12,
    });
    expect(oneHundredMsePerChannel.mse).toBe(100);
    expect(oneHundredMsePerChannel.psnr).toBeCloseTo(10 * Math.log10((255 * 255) / 100));

    const maximumRgbError = computePsnrFromTextureReduction({
      sumSquaredError: 255 * 255 * 3,
      validPixelCount: 1,
    });
    expect(maximumRgbError.mse).toBe(255 * 255);
    expect(maximumRgbError.psnr).toBe(0);
  });

  it('decodes shifted fixed-point SSIM reductions without affecting PSNR', () => {
    const result = computePsnrFromTextureReduction({
      sumSquaredError: 100 * 4 * 3,
      validPixelCount: 4,
      ssimScaledSum: Math.round((0.75 + 1) * 500_000 * 4),
      ssimWindowCount: 4,
    });

    expect(result.mse).toBe(100);
    expect(result.psnr).toBeCloseTo(28.130803608679106);
    expect(result.ssim).toBeCloseTo(0.75);
  });

  it('compares textures directly and reads back only the final 64-bit reduction pairs', async () => {
    const fake = makeFakeDevice(metricReadback(0, 1));
    const renderedTexture = makeTexture();
    const groundTruthTexture = makeTexture();

    const result = await computePsnrFromRgbaTexturesWebGpu({
      device: fake.device,
      renderedTexture,
      groundTruthTexture,
      width: 1,
      height: 1,
    });

    expect(result.psnr).toBe(Infinity);
    expect(result.mse).toBe(0);
    expect(result.sumSquaredError).toBe(0);
    expect(result.validPixelCount).toBe(1);
    expect(result.ssim).toBe(1);
    expect(fake.dispatches).toEqual([[1, 1, undefined]]);
    expect(fake.copySizes).toEqual([32]);
    expect(fake.shaderCodes.join('\n')).toContain('textureLoad');
    expect(fake.shaderCodes.join('\n')).toContain('MetricPartial');
    expect(fake.shaderCodes.join('\n')).toContain('computeWindowSsim');
    expect(fake.shaderCodes.join('\n')).toContain('isSampleValid');
    expect(fake.bindGroups[0].entries[0].resource).toEqual({ kind: 'texture-view' });
    expect(fake.bindGroups[0].entries[1].resource).toEqual({ kind: 'texture-view' });
    expect(fake.bindGroups[0].entries[2].resource).toEqual({ kind: 'texture-view' });
    expect(getWebGpuSplatDebugCounters().buffers).toBe(0);
    expect(getWebGpuSplatTelemetryEvents()).toEqual([
      expect.objectContaining({
        name: 'psnr-reduction',
        readbackBytes: 32,
        readbackDurationMs: expect.any(Number),
        details: expect.objectContaining({
          width: 1,
          height: 1,
          pixelCount: 1,
          masked: false,
          compareWorkgroups: 1,
        }),
      }),
    ]);
  });

  it('exposes tiling-ready reduction data and pure PSNR calculation', async () => {
    const fake = makeFakeDevice(metricReadback(255 * 255 * 3, 1, 0));

    const reduction = await computePsnrTextureReductionFromRgbaTexturesWebGpu({
      device: fake.device,
      renderedTexture: makeTexture(),
      groundTruthTexture: makeTexture(),
      width: 1,
      height: 1,
    });
    const accumulated = accumulatePsnrTextureReductions([
      reduction,
      { sumSquaredError: 0, validPixelCount: 1 },
    ]);
    const result = computePsnrFromTextureReduction(accumulated);

    expect(reduction).toEqual({
      sumSquaredError: 255 * 255 * 3,
      validPixelCount: 1,
      ssimScaledSum: 500_000,
      ssimWindowCount: 1,
    });
    expect(accumulated).toEqual({
      sumSquaredError: 255 * 255 * 3,
      validPixelCount: 2,
    });
    expect(result.mse).toBeCloseTo((255 * 255 * 3) / 6);
    expect(result.psnr).toBeCloseTo(10 * Math.log10((255 * 255) / result.mse));
    expect(result.ssim).toBeUndefined();
    expect(fake.copySizes).toEqual([32]);
    expect(getWebGpuSplatDebugCounters().buffers).toBe(0);
  });

  it('reduces multi-workgroup texture partials on GPU before the final metric readback', async () => {
    const fake = makeFakeDevice(metricReadback(255 * 255 * 3, 1, 0));

    const result = await computePsnrFromRgbaTexturesWebGpu({
      device: fake.device,
      renderedTexture: makeTexture(),
      groundTruthTexture: makeTexture(),
      width: 129,
      height: 1,
      renderedOrigin: { x: 2, y: 3 },
      groundTruthOrigin: { x: 4, y: 5 },
    });

    expect(result.psnr).toBeCloseTo(0);
    expect(result.validPixelCount).toBe(1);
    expect(fake.dispatches).toEqual([[3, 1, undefined], [1, 1, undefined]]);
    expect(fake.copySizes).toEqual([32]);
    expect(fake.writeBuffers.length).toBe(2);
    expect(new Uint32Array(fake.writeBuffers[0])).toEqual(new Uint32Array([
      129, 1,
      2, 3,
      4, 5,
      4, 5,
      0,
      3, 3,
      0,
    ]));
    expect(new Uint32Array(fake.writeBuffers[1])).toEqual(new Uint32Array([3, 1, 1, 0]));
    expect(getWebGpuSplatDebugCounters().buffers).toBe(0);
    expect(getWebGpuSplatTelemetryEvents()).toContainEqual(expect.objectContaining({
      name: 'psnr-reduction',
      readbackBytes: 32,
      details: expect.objectContaining({
        width: 129,
        height: 1,
        compareWorkgroups: 3,
      }),
    }));
  });

  it('splits large texture reductions across 2D compute dispatches', async () => {
    const fake = makeFakeDevice(metricReadback(0, 1), {
      maxComputeWorkgroupsPerDimension: 3,
    });

    await computePsnrTextureReductionFromRgbaTexturesWebGpu({
      device: fake.device,
      renderedTexture: makeTexture(),
      groundTruthTexture: makeTexture(),
      width: 257,
      height: 1,
    });

    expect(fake.dispatches).toEqual([[3, 2, undefined], [1, 1, undefined]]);
    expect(new Uint32Array(fake.writeBuffers[0])).toEqual(new Uint32Array([
      257, 1,
      0, 0,
      0, 0,
      0, 0,
      0,
      3, 5,
      0,
    ]));
    expect(new Uint32Array(fake.writeBuffers[1])).toEqual(new Uint32Array([5, 1, 1, 0]));
    expect(getWebGpuSplatTelemetryEvents()).toContainEqual(expect.objectContaining({
      name: 'psnr-reduction',
      details: expect.objectContaining({
        compareWorkgroups: 5,
        compareDispatchX: 3,
        compareDispatchY: 2,
      }),
    }));
  });

  it('uses an optional mask texture for both PSNR and SSIM valid-pixel selection', async () => {
    const fake = makeFakeDevice(metricReadback(0, 2, 0.9, 2));
    const renderedTexture = makeTexture();
    const groundTruthTexture = makeTexture();
    const maskTexture = makeTexture();

    const result = await computePsnrFromRgbaTexturesWebGpu({
      device: fake.device,
      renderedTexture,
      groundTruthTexture,
      maskTexture,
      width: 4,
      height: 1,
      maskOrigin: { x: 7, y: 8 },
    });

    expect(result.validPixelCount).toBe(2);
    expect(result.ssim).toBeCloseTo(0.9);
    expect(fake.bindGroups[0].entries[2].resource).toEqual({ kind: 'texture-view' });
    expect(maskTexture.createView).toHaveBeenCalledTimes(1);
    expect(new Uint32Array(fake.writeBuffers[0])).toEqual(new Uint32Array([
      4, 1,
      0, 0,
      0, 0,
      7, 8,
      1,
      1, 1,
      0,
    ]));
    expect(getWebGpuSplatTelemetryEvents()).toContainEqual(expect.objectContaining({
      name: 'psnr-reduction',
      details: expect.objectContaining({
        masked: true,
        compareWorkgroups: 1,
      }),
    }));
  });

  it('rejects invalid dimensions and origins before submitting GPU work', async () => {
    const fake = makeFakeDevice([0, 0, 0, 0]);
    await expect(computePsnrFromRgbaTexturesWebGpu({
      device: fake.device,
      renderedTexture: makeTexture(),
      groundTruthTexture: makeTexture(),
      width: 0,
      height: 1,
    })).rejects.toThrow('Invalid WebGPU PSNR texture width');

    await expect(computePsnrFromRgbaTexturesWebGpu({
      device: fake.device,
      renderedTexture: makeTexture(),
      groundTruthTexture: makeTexture(),
      width: 1,
      height: 1,
      renderedOrigin: { x: -1, y: 0 },
    })).rejects.toThrow('Invalid WebGPU PSNR texture renderedOrigin.x');

    expect(fake.dispatches).toEqual([]);
    expect(getWebGpuSplatDebugCounters().buffers).toBe(0);
    expect(getWebGpuSplatTelemetryEvents()).toEqual([]);
  });
});
