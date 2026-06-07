import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebGpuPsnrGroundTruthTextureFromBitmap } from './psnrGroundTruthTexture';
import {
  getWebGpuSplatDebugCounters,
  resetWebGpuSplatDebugCountersForTests,
} from './webGpuSplatDebugCounters';

function makeBitmap(width: number, height: number): ImageBitmap {
  return { width, height } as ImageBitmap;
}

function makeFakeDevice() {
  const createdTextures: Array<GPUTextureDescriptor & { texture: GPUTexture }> = [];
  const shaderCodes: string[] = [];
  const writeBuffers: ArrayBuffer[] = [];
  const dispatches: Array<[number, number?]> = [];
  const submissions: GPUCommandBuffer[][] = [];
  const externalCopies: Array<{
    source: GPUImageCopyExternalImage;
    destination: GPUImageCopyTextureTagged;
    size: GPUExtent3DStrict;
  }> = [];
  const pass = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    dispatchWorkgroups: vi.fn((x: number, y?: number) => dispatches.push([x, y])),
    end: vi.fn(),
  };
  const commandEncoder = {
    beginComputePass: vi.fn(() => pass),
    finish: vi.fn(() => ({ kind: 'command-buffer' } as unknown as GPUCommandBuffer)),
  };
  const device = {
    createTexture: vi.fn((descriptor: GPUTextureDescriptor) => {
      const texture = {
        createView: vi.fn(() => ({ kind: 'texture-view' })),
        destroy: vi.fn(),
      } as unknown as GPUTexture;
      createdTextures.push({ ...descriptor, texture });
      return texture;
    }),
    createShaderModule: vi.fn(({ code }: GPUShaderModuleDescriptor) => {
      shaderCodes.push(code);
      return { kind: 'shader-module' } as unknown as GPUShaderModule;
    }),
    createComputePipeline: vi.fn(() => ({
      getBindGroupLayout: vi.fn(() => ({ kind: 'layout' } as unknown as GPUBindGroupLayout)),
    } as unknown as GPUComputePipeline)),
    createSampler: vi.fn(() => ({ kind: 'sampler' } as unknown as GPUSampler)),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() } as unknown as GPUBuffer)),
    createBindGroup: vi.fn(() => ({ kind: 'bind-group' } as unknown as GPUBindGroup)),
    createCommandEncoder: vi.fn(() => commandEncoder),
    queue: {
      copyExternalImageToTexture: vi.fn((
        source: GPUImageCopyExternalImage,
        destination: GPUImageCopyTextureTagged,
        size: GPUExtent3DStrict
      ) => externalCopies.push({ source, destination, size })),
      writeBuffer: vi.fn((_buffer: GPUBuffer, _offset: number, data: BufferSource) => {
        writeBuffers.push(data instanceof ArrayBuffer ? data : data.buffer.slice(0));
      }),
      submit: vi.fn((commands: GPUCommandBuffer[]) => submissions.push(commands)),
    },
  } as unknown as GPUDevice;

  return {
    commandEncoder,
    createdTextures,
    device,
    dispatches,
    externalCopies,
    pass,
    shaderCodes,
    submissions,
    writeBuffers,
  };
}

describe('WebGPU PSNR ground-truth texture helpers', () => {
  beforeEach(() => {
    resetWebGpuSplatDebugCountersForTests();
  });

  it('uploads same-size pinhole ground truth without a resize pass', () => {
    const fake = makeFakeDevice();
    const bitmap = makeBitmap(800, 400);

    const result = createWebGpuPsnrGroundTruthTextureFromBitmap({
      device: fake.device,
      source: bitmap,
      targetWidth: 800,
      targetHeight: 400,
    });

    expect(result.width).toBe(800);
    expect(result.height).toBe(400);
    expect(result.texture).toBe(fake.createdTextures[0].texture);
    expect(fake.createdTextures).toHaveLength(1);
    expect(fake.createdTextures[0].format).toBe('rgba8unorm');
    expect(fake.createdTextures[0].usage).toBe(0x02 | 0x04 | 0x10);
    expect(fake.externalCopies).toHaveLength(1);
    expect(fake.externalCopies[0].source).toEqual({ source: bitmap, origin: { x: 0, y: 0 } });
    expect(fake.externalCopies[0].destination).toEqual({
      texture: fake.createdTextures[0].texture,
      colorSpace: 'srgb',
      premultipliedAlpha: false,
    });
    expect(fake.externalCopies[0].size).toEqual({ width: 800, height: 400 });
    expect(fake.dispatches).toEqual([]);
    expect(fake.submissions).toEqual([]);
    expect(getWebGpuSplatDebugCounters()).toMatchObject({
      textures: 1,
      buffers: 0,
    });

    result.dispose();
    result.dispose();
    expect(fake.createdTextures[0].texture.destroy).toHaveBeenCalledTimes(1);
    expect(getWebGpuSplatDebugCounters()).toMatchObject({
      textures: 0,
      buffers: 0,
    });
  });

  it('resizes pinhole ground truth with a texture-to-texture compute pass', () => {
    const fake = makeFakeDevice();
    const bitmap = makeBitmap(1600, 800);

    const result = createWebGpuPsnrGroundTruthTextureFromBitmap({
      device: fake.device,
      source: bitmap,
      targetWidth: 800,
      targetHeight: 400,
    });

    expect(result.width).toBe(800);
    expect(result.height).toBe(400);
    expect(result.texture).toBe(fake.createdTextures[1].texture);
    expect(fake.createdTextures).toHaveLength(2);
    expect(fake.createdTextures[0].format).toBe('rgba8unorm');
    expect(fake.createdTextures[1].format).toBe('rgba8unorm');
    expect(fake.createdTextures[0].usage).toBe(0x02 | 0x04 | 0x10);
    expect(fake.createdTextures[1].usage).toBe(0x01 | 0x04 | 0x08);
    expect(fake.shaderCodes.join('\n')).toContain('textureSampleLevel');
    expect(fake.shaderCodes.join('\n')).toContain('texture_storage_2d<rgba8unorm, write>');
    expect(fake.dispatches).toEqual([[100, 50]]);
    expect(fake.submissions).toHaveLength(1);
    expect(new Uint32Array(fake.writeBuffers[0])).toEqual(new Uint32Array([1600, 800, 800, 400]));
    expect(getWebGpuSplatDebugCounters()).toMatchObject({
      textures: 2,
      buffers: 0,
    });

    result.dispose();
    result.dispose();
    expect(fake.createdTextures[0].texture.destroy).toHaveBeenCalledTimes(1);
    expect(fake.createdTextures[1].texture.destroy).toHaveBeenCalledTimes(1);
    expect(getWebGpuSplatDebugCounters()).toMatchObject({
      textures: 0,
      buffers: 0,
    });
  });

  it('uploads a same-size source tile from a bitmap region without a resize pass', () => {
    const fake = makeFakeDevice();
    const bitmap = makeBitmap(1600, 800);

    const result = createWebGpuPsnrGroundTruthTextureFromBitmap({
      device: fake.device,
      source: bitmap,
      sourceOrigin: { x: 512, y: 128 },
      sourceWidth: 256,
      sourceHeight: 128,
      targetWidth: 256,
      targetHeight: 128,
    });

    expect(result.width).toBe(256);
    expect(result.height).toBe(128);
    expect(fake.createdTextures).toHaveLength(1);
    expect(fake.createdTextures[0].size).toEqual({ width: 256, height: 128 });
    expect(fake.createdTextures[0].format).toBe('rgba8unorm');
    expect(fake.createdTextures[0].usage).toBe(0x02 | 0x04 | 0x10);
    expect(fake.externalCopies).toHaveLength(1);
    expect(fake.externalCopies[0].source).toEqual({
      source: bitmap,
      origin: { x: 512, y: 128 },
    });
    expect(fake.externalCopies[0].destination).toEqual({
      texture: fake.createdTextures[0].texture,
      colorSpace: 'srgb',
      premultipliedAlpha: false,
    });
    expect(fake.externalCopies[0].size).toEqual({ width: 256, height: 128 });
    expect(fake.dispatches).toEqual([]);
    expect(getWebGpuSplatDebugCounters().textures).toBe(1);

    result.dispose();
    expect(fake.createdTextures[0].texture.destroy).toHaveBeenCalledTimes(1);
    expect(getWebGpuSplatDebugCounters().textures).toBe(0);
  });

  it('rejects invalid source or target sizes before creating textures', () => {
    const fake = makeFakeDevice();

    expect(() => createWebGpuPsnrGroundTruthTextureFromBitmap({
      device: fake.device,
      source: makeBitmap(0, 400),
      targetWidth: 800,
      targetHeight: 400,
    })).toThrow('Invalid WebGPU PSNR ground-truth texture bitmap width');

    expect(() => createWebGpuPsnrGroundTruthTextureFromBitmap({
      device: fake.device,
      source: makeBitmap(800, 400),
      targetWidth: 0,
      targetHeight: 400,
    })).toThrow('Invalid WebGPU PSNR ground-truth texture target width');

    expect(() => createWebGpuPsnrGroundTruthTextureFromBitmap({
      device: fake.device,
      source: makeBitmap(800, 400),
      sourceOrigin: { x: 700, y: 0 },
      sourceWidth: 200,
      sourceHeight: 100,
      targetWidth: 200,
      targetHeight: 100,
    })).toThrow('source region: 700,0 200x100 exceeds bitmap 800x400');

    expect(fake.createdTextures).toHaveLength(0);
    expect(getWebGpuSplatDebugCounters()).toMatchObject({
      textures: 0,
      buffers: 0,
    });
  });
});
