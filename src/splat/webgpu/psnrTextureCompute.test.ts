import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  accumulatePsnrTextureReductions,
  computePsnrFromRgbaTexturesWebGpu,
  computePsnrFromTextureReduction,
  computePsnrTextureColorDiagnosticsFromRgbaTexturesWebGpu,
  computePsnrTextureOffsetDiagnosticsFromRgbaTexturesWebGpu,
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

describe('WebGPU PSNR texture compute', () => {
  beforeEach(() => {
    resetWebGpuSplatDebugCountersForTests();
    resetWebGpuSplatTelemetryEventsForTests();
  });

  it('compares textures directly and reads back only the final 64-bit reduction pairs', async () => {
    const fake = makeFakeDevice([0, 0, 1, 0]);
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
    expect(fake.dispatches).toEqual([[1, 1, undefined]]);
    expect(fake.copySizes).toEqual([16]);
    expect(fake.shaderCodes.join('\n')).toContain('textureLoad');
    expect(fake.shaderCodes.join('\n')).toContain('vec4<u32>');
    expect(fake.bindGroups[0].entries[0].resource).toEqual({ kind: 'texture-view' });
    expect(fake.bindGroups[0].entries[1].resource).toEqual({ kind: 'texture-view' });
    expect(getWebGpuSplatDebugCounters().buffers).toBe(0);
    expect(getWebGpuSplatTelemetryEvents()).toEqual([
      expect.objectContaining({
        name: 'psnr-reduction',
        readbackBytes: 16,
        readbackDurationMs: expect.any(Number),
        details: expect.objectContaining({
          width: 1,
          height: 1,
          pixelCount: 1,
          compareWorkgroups: 1,
        }),
      }),
    ]);
  });

  it('exposes tiling-ready reduction data and pure PSNR calculation', async () => {
    const fake = makeFakeDevice([255 * 255 * 3, 0, 1, 0]);

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
    });
    expect(accumulated).toEqual({
      sumSquaredError: 255 * 255 * 3,
      validPixelCount: 2,
    });
    expect(result.mse).toBeCloseTo((255 * 255 * 3) / 6);
    expect(result.psnr).toBeCloseTo(10 * Math.log10((255 * 255) / result.mse));
    expect(fake.copySizes).toEqual([16]);
    expect(getWebGpuSplatDebugCounters().buffers).toBe(0);
  });

  it('reduces multi-workgroup texture partials on GPU before the 16-byte readback', async () => {
    const fake = makeFakeDevice([255 * 255 * 3, 0, 1, 0]);

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
    expect(fake.copySizes).toEqual([16]);
    expect(fake.writeBuffers.length).toBe(2);
    expect(new Uint32Array(fake.writeBuffers[0])).toEqual(new Uint32Array([129, 1, 2, 3, 4, 5, 3, 3]));
    expect(new Uint32Array(fake.writeBuffers[1])).toEqual(new Uint32Array([3, 1, 1, 0]));
    expect(getWebGpuSplatDebugCounters().buffers).toBe(0);
    expect(getWebGpuSplatTelemetryEvents()).toContainEqual(expect.objectContaining({
      name: 'psnr-reduction',
      readbackBytes: 16,
      details: expect.objectContaining({
        width: 129,
        height: 1,
        compareWorkgroups: 3,
      }),
    }));
  });

  it('computes low-PSNR color diagnostics with a small scalar readback', async () => {
    const fake = makeFakeDevice([
      12, 0,
      2, 0,
      20, 0,
      40, 0,
      60, 0,
      30, 0,
      36, 0,
      70, 0,
    ]);

    const diagnostics = await computePsnrTextureColorDiagnosticsFromRgbaTexturesWebGpu({
      device: fake.device,
      renderedTexture: makeTexture(),
      groundTruthTexture: makeTexture(),
      width: 4,
      height: 2,
    });

    expect(diagnostics).toEqual({
      validPixelCount: 2,
      validPixelRatio: 0.25,
      renderedMeanRgb: [10, 20, 30],
      groundTruthMeanRgb: [15, 18, 35],
      meanRgbDelta: [-5, 2, -5],
    });
    expect(fake.copySizes).toEqual([64]);
    expect(fake.shaderCodes.join('\n')).toContain('DiagnosticPartial');
    expect(getWebGpuSplatDebugCounters().buffers).toBe(0);
    expect(getWebGpuSplatTelemetryEvents()).toEqual([
      expect.objectContaining({
        name: 'psnr-diagnostics',
        readbackBytes: 64,
        details: expect.objectContaining({
          width: 4,
          height: 2,
          pixelCount: 8,
        }),
      }),
    ]);
  });

  it('splits large texture reductions across 2D compute dispatches', async () => {
    const fake = makeFakeDevice([0, 0, 1, 0], {
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
    expect(new Uint32Array(fake.writeBuffers[0])).toEqual(new Uint32Array([257, 1, 0, 0, 0, 0, 3, 5]));
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

  it('searches small pixel offsets with GPU reductions and reports the best alignment', async () => {
    const highError = [30_000, 0, 12, 0];
    const fake = makeFakeDevice([
      highError,
      highError,
      highError,
      highError,
      [1_200, 0, 16, 0],
      [12, 0, 12, 0],
      highError,
      highError,
      highError,
    ]);

    const diagnostics = await computePsnrTextureOffsetDiagnosticsFromRgbaTexturesWebGpu({
      device: fake.device,
      renderedTexture: makeTexture(),
      groundTruthTexture: makeTexture(),
      width: 4,
      height: 4,
      maxOffsetPixels: 1,
    });

    expect(diagnostics.evaluatedOffsetCount).toBe(9);
    expect(diagnostics.maxOffsetPixels).toBe(1);
    expect(diagnostics.baseline).toMatchObject({
      dx: 0,
      dy: 0,
      sumSquaredError: 1_200,
      validPixelCount: 16,
    });
    expect(diagnostics.best).toMatchObject({
      dx: 1,
      dy: 0,
      sumSquaredError: 12,
      validPixelCount: 12,
    });
    expect(diagnostics.improvementDb).toBeGreaterThan(10);
    expect(fake.copySizes).toEqual(Array.from({ length: 9 }, () => 16));
    expect(fake.writeBuffers.map((buffer) => Array.from(new Uint32Array(buffer)).slice(0, 6))).toEqual([
      [3, 3, 0, 0, 1, 1],
      [4, 3, 0, 0, 0, 1],
      [3, 3, 1, 0, 0, 1],
      [3, 4, 0, 0, 1, 0],
      [4, 4, 0, 0, 0, 0],
      [3, 4, 1, 0, 0, 0],
      [3, 3, 0, 1, 1, 0],
      [4, 3, 0, 1, 0, 0],
      [3, 3, 1, 1, 0, 0],
    ]);
    expect(getWebGpuSplatDebugCounters().buffers).toBe(0);
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

    await expect(computePsnrTextureOffsetDiagnosticsFromRgbaTexturesWebGpu({
      device: fake.device,
      renderedTexture: makeTexture(),
      groundTruthTexture: makeTexture(),
      width: 1,
      height: 1,
      maxOffsetPixels: 9,
    })).rejects.toThrow('Invalid WebGPU PSNR texture maxOffsetPixels');

    expect(fake.dispatches).toEqual([]);
    expect(getWebGpuSplatDebugCounters().buffers).toBe(0);
    expect(getWebGpuSplatTelemetryEvents()).toEqual([]);
  });
});
