import { describe, expect, it, vi } from 'vitest';
import type { GaussianCloud } from '../gaussianCloud';
import {
  createLocalGsplatRendererAdapter,
  type LocalGsplatRendererFrame,
} from './localGsplatRendererAdapter';

function makeCloud(): GaussianCloud {
  return {
    count: 1,
    positions: new Float32Array([0, 0, 0]),
    scales: new Float32Array([1, 1, 1]),
    rotations: new Float32Array([1, 0, 0, 0]),
    opacities: new Float32Array([0.5]),
    sh0: new Float32Array([0.1, 0.2, 0.3]),
    shDegree: 0,
  };
}

function makeFrame(overrides: Partial<LocalGsplatRendererFrame> = {}): LocalGsplatRendererFrame {
  const viewMatrix = new Float32Array(16);
  const projectionMatrix = new Float32Array(16);
  const worldMatrix = new Float32Array(16);
  viewMatrix[0] = 1;
  viewMatrix[5] = 1;
  viewMatrix[10] = 1;
  viewMatrix[15] = 1;
  projectionMatrix[0] = 2;
  projectionMatrix[5] = 2;
  projectionMatrix[10] = -1;
  projectionMatrix[15] = 1;
  worldMatrix[0] = 1;
  worldMatrix[5] = 1;
  worldMatrix[10] = 1;
  worldMatrix[15] = 1;

  return {
    viewport: {
      pixelWidth: 800,
      pixelHeight: 400,
    },
    camera: {
      kind: 'perspective',
      viewMatrix,
      projectionMatrix,
      worldMatrix,
      position: [1, 2, 3],
      near: 0.2,
      far: 200,
    },
    ...overrides,
  };
}

function createFakeRendererModule() {
  const camera = {
    position: new Float32Array(3),
    target: new Float32Array(3),
    up: new Float32Array([0, 1, 0]),
    fov: 50,
    near: 0.1,
    far: 1000,
    aspect: 1,
  };
  const renderer = {
    loadGaussians: vi.fn(),
    render: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    getCamera: vi.fn(() => camera),
    setCameraModel: vi.fn(),
    setBackgroundColor: vi.fn(),
    setFov: vi.fn((degrees: number) => {
      camera.fov = degrees;
    }),
    setDepthRange: vi.fn(),
  };
  const module = {
    GaussianRenderer: {
      CAMERA_PINHOLE: 0,
      CAMERA_ORTHO: 1,
      create: vi.fn().mockResolvedValue(renderer),
    },
  };

  return { camera, renderer, module };
}

describe('local gsplat renderer adapter', () => {
  it('initializes the local renderer with pinhole camera and black background', async () => {
    const { renderer, module } = createFakeRendererModule();

    await createLocalGsplatRendererAdapter({} as HTMLCanvasElement, {
      loadRendererModule: vi.fn().mockResolvedValue(module),
    });

    expect(module.GaussianRenderer.create).toHaveBeenCalledTimes(1);
    expect(renderer.setCameraModel).toHaveBeenCalledWith(0);
    expect(renderer.setBackgroundColor).toHaveBeenCalledWith(0, 0, 0);
  });

  it('syncs a Three camera snapshot into the renderer camera and renders after cloud load', async () => {
    const { camera, renderer, module } = createFakeRendererModule();
    const adapter = await createLocalGsplatRendererAdapter({} as HTMLCanvasElement, {
      loadRendererModule: vi.fn().mockResolvedValue(module),
    });

    adapter.setFrameSnapshot(makeFrame());

    expect(renderer.resize).toHaveBeenCalledWith(800, 400);
    expect(renderer.render).not.toHaveBeenCalled();
    expect(Array.from(camera.position)).toEqual([1, 2, 3]);
    expect(Array.from(camera.target)).toEqual([1, 2, 2]);
    expect(Array.from(camera.up)).toEqual([0, 1, 0]);
    expect(camera.aspect).toBe(2);
    expect(camera.near).toBe(0.2);
    expect(camera.far).toBe(200);
    expect(renderer.setCameraModel).toHaveBeenLastCalledWith(0);
    expect(renderer.setFov).toHaveBeenCalledWith(53.13010235415598);

    const cloud = makeCloud();
    adapter.loadCloud(cloud);

    expect(renderer.loadGaussians).toHaveBeenCalledWith(cloud, { fitCamera: false });
    expect(renderer.render).toHaveBeenCalledTimes(1);

    adapter.setFrameSnapshot(makeFrame());
    expect(renderer.resize).toHaveBeenCalledTimes(1);
    expect(renderer.render).toHaveBeenCalledTimes(2);
  });

  it('uses the local orthographic camera model for orthographic snapshots', async () => {
    const { renderer, module } = createFakeRendererModule();
    const adapter = await createLocalGsplatRendererAdapter({} as HTMLCanvasElement, {
      loadRendererModule: vi.fn().mockResolvedValue(module),
    });

    adapter.setFrameSnapshot(makeFrame({
      camera: {
        ...makeFrame().camera,
        kind: 'orthographic',
      },
    }));

    expect(renderer.setCameraModel).toHaveBeenLastCalledWith(1);
  });

  it('disposes the local renderer once', async () => {
    const { renderer, module } = createFakeRendererModule();
    const adapter = await createLocalGsplatRendererAdapter({} as HTMLCanvasElement, {
      loadRendererModule: vi.fn().mockResolvedValue(module),
    });

    adapter.dispose();
    adapter.dispose();

    expect(renderer.destroy).toHaveBeenCalledTimes(1);
  });
});
