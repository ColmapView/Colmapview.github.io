import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildCamera, buildFile, buildImage } from '../../test/builders';
import type { SparkModule } from '../../utils/sparkSplatRuntime';
import {
  createSparkSplatPsnrSession,
  flipRgbaRows,
} from './sparkPsnrSession';

describe('Spark splat PSNR session', () => {
  it('flips WebGL readback rows into top-left image order', () => {
    const bottomUp = new Uint8Array([
      30, 0, 0, 255,
      40, 0, 0, 255,
      10, 0, 0, 255,
      20, 0, 0, 255,
    ]);

    expect(Array.from(flipRgbaRows(bottomUp, 2, 2))).toEqual([
      10, 0, 0, 255,
      20, 0, 0, 255,
      30, 0, 0, 255,
      40, 0, 0, 255,
    ]);
  });

  it('renders metrics through an isolated Spark renderer and returns plain metric data', async () => {
    const splatFile = buildFile('scene.spz', 'splat');
    const imageFile = buildFile('image.jpg', 'image');
    const maskFile = buildFile('image.png', 'mask');
    const camera = buildCamera({ width: 2, height: 2 });
    const image = buildImage({ cameraId: camera.cameraId, name: imageFile.name });
    const bottomUpPixels = new Uint8Array([
      30, 0, 0, 255,
      40, 0, 0, 255,
      10, 0, 0, 255,
      20, 0, 0, 255,
    ]);
    const groundTruthPixels = new Uint8ClampedArray(2 * 2 * 4);
    const maskPixels = new Uint8ClampedArray(2 * 2 * 4).fill(255);
    const sparkRendererInstances: FakeSparkRenderer[] = [];
    const splatMeshInstances: FakeSplatMesh[] = [];

    class FakeSparkRenderer extends THREE.Object3D {
      readonly dispose = vi.fn();
      readonly renderReadTarget = vi.fn(async () => bottomUpPixels);

      constructor(readonly options: unknown) {
        super();
        sparkRendererInstances.push(this);
      }
    }

    class FakeSplatMesh extends THREE.Object3D {
      readonly initialized: Promise<FakeSplatMesh>;
      readonly dispose = vi.fn();

      constructor(readonly options: unknown) {
        super();
        this.initialized = Promise.resolve(this);
        splatMeshInstances.push(this);
      }
    }

    const renderer = {
      setPixelRatio: vi.fn(),
      setClearColor: vi.fn(),
      setSize: vi.fn(),
      dispose: vi.fn(),
      outputColorSpace: null,
      toneMapping: null,
      autoClear: false,
    } as unknown as THREE.WebGLRenderer;
    const createRenderer = vi.fn(() => renderer);
    const createMetricCamera = vi.fn(() => new THREE.PerspectiveCamera());
    const createGroundTruthPixels = vi.fn(async (file: File) =>
      file === maskFile ? maskPixels : groundTruthPixels
    );
    const computePsnrAndSsimFromRgba = vi.fn(() => ({
      psnr: 31,
      ssim: 0.94,
      mse: 12,
      validPixelCount: 4,
    }));

    const session = await createSparkSplatPsnrSession({
      splatFile,
      deps: {
        preloadSparkModule: vi.fn(async () => ({
          SparkRenderer: FakeSparkRenderer,
          SplatMesh: FakeSplatMesh,
        } as unknown as SparkModule)),
        getSplatMeshSourceOptions: vi.fn(async () => ({
          fileBytes: new Uint8Array([1, 2, 3]),
        })),
        createCanvas: vi.fn(() => document.createElement('canvas')),
        createRenderer,
        createMetricCamera,
        createGroundTruthPixels,
        computePsnrAndSsimFromRgba,
      },
    });

    const result = await session.computeImageMetric({
      imageFile,
      maskFile,
      image,
      camera,
      width: 2,
      height: 2,
    });

    expect(result).toEqual({
      psnr: 31,
      ssim: 0.94,
      mse: 12,
      validPixelCount: 4,
    });
    expect(createRenderer).toHaveBeenCalledTimes(1);
    expect(splatMeshInstances).toHaveLength(1);
    expect(sparkRendererInstances).toHaveLength(1);
    expect(renderer.setSize).toHaveBeenCalledWith(2, 2, false);
    expect(sparkRendererInstances[0].renderReadTarget).toHaveBeenCalledWith({
      scene: expect.any(THREE.Scene),
      camera: expect.any(THREE.PerspectiveCamera),
    });
    expect(computePsnrAndSsimFromRgba).toHaveBeenCalledWith(
      new Uint8Array([
        10, 0, 0, 255,
        20, 0, 0, 255,
        30, 0, 0, 255,
        40, 0, 0, 255,
      ]),
      groundTruthPixels,
      {
        width: 2,
        height: 2,
        maskPixels,
      }
    );

    session.dispose();

    expect(sparkRendererInstances[0].dispose).toHaveBeenCalledTimes(1);
    expect(splatMeshInstances[0].dispose).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });

  it('applies the scene transform to the Spark mesh when no model transform is provided', async () => {
    const splatFile = buildFile('scene.spz', 'splat');
    const imageFile = buildFile('image.jpg', 'image');
    const camera = buildCamera({ width: 1, height: 1 });
    const image = buildImage({ cameraId: camera.cameraId, name: imageFile.name });
    const splatMeshInstances: FakeSplatMesh[] = [];

    class FakeSparkRenderer extends THREE.Object3D {
      readonly dispose = vi.fn();
      readonly renderReadTarget = vi.fn(async () => new Uint8Array([10, 20, 30, 255]));
    }

    class FakeSplatMesh extends THREE.Object3D {
      readonly initialized: Promise<FakeSplatMesh>;
      readonly dispose = vi.fn();

      constructor() {
        super();
        this.initialized = Promise.resolve(this);
        splatMeshInstances.push(this);
      }
    }

    const createMetricCamera = vi.fn(() => new THREE.PerspectiveCamera());
    const session = await createSparkSplatPsnrSession({
      splatFile,
      deps: {
        preloadSparkModule: vi.fn(async () => ({
          SparkRenderer: FakeSparkRenderer,
          SplatMesh: FakeSplatMesh,
        } as unknown as SparkModule)),
        getSplatMeshSourceOptions: vi.fn(async () => ({
          fileBytes: new Uint8Array([1, 2, 3]),
        })),
        createCanvas: vi.fn(() => document.createElement('canvas')),
        createRenderer: vi.fn(() => ({
          setPixelRatio: vi.fn(),
          setClearColor: vi.fn(),
          setSize: vi.fn(),
          dispose: vi.fn(),
          outputColorSpace: null,
          toneMapping: null,
          autoClear: false,
        } as unknown as THREE.WebGLRenderer)),
        createMetricCamera,
        createGroundTruthPixels: vi.fn(async () => new Uint8ClampedArray(4)),
        computePsnrAndSsimFromRgba: vi.fn(() => ({
          psnr: 31,
          ssim: 0.94,
          mse: 12,
          validPixelCount: 1,
        })),
      },
    });
    const sceneTransform = {
      scale: 2,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      translationX: 1,
      translationY: 2,
      translationZ: 3,
    };

    await session.computeImageMetric({
      imageFile,
      image,
      camera,
      width: 1,
      height: 1,
      transform: sceneTransform,
    });

    expect(createMetricCamera).toHaveBeenCalledWith(image, camera, 1, 1, sceneTransform);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    splatMeshInstances[0].matrix.decompose(position, quaternion, scale);
    expect(splatMeshInstances[0].matrixAutoUpdate).toBe(false);
    expect(position.toArray()).toEqual([1, 2, 3]);
    expect(scale.toArray()).toEqual([2, 2, 2]);

    session.dispose();
  });
});
