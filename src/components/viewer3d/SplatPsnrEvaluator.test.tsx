import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SplatMetricCapability } from '../../utils/splatBackendPolicy';
import {
  buildCamera,
  buildFile,
  buildImage,
  buildLoadedFiles,
  buildReconstruction,
} from '../../test/builders';
import { CameraModelId } from '../../types/colmap';
import type { SplatPsnrEvaluatorStoreFacade } from './SplatPsnrEvaluatorStoreFacade';
import { SplatPsnrEvaluator } from './SplatPsnrEvaluator';
import { PsnrMetricImageDimensionMismatchError } from '../../splat/webgpu/psnrMetricImageError';
import { appLogger } from '../../utils/logger';
import {
  clearVisibleWebGpuSplatSharedRuntimesForTests,
  createVisibleWebGpuSplatSceneId,
  registerVisibleWebGpuSplatSharedRuntime,
} from '../../splat/webgpu/visibleSplatRuntimeRegistry';

const {
  deviceLossListenerRef,
  createWebGpuSplatPsnrSessionMock,
  ensureSplatPsnrWebGpuDeviceMock,
  loadGaussianCloudFromFileMock,
  prefetchFrustumTexturesInBackgroundMock,
  subscribeSplatPsnrWebGpuDeviceLossMock,
  useSplatPsnrEvaluatorStoreFacadeMock,
} = vi.hoisted(() => ({
  deviceLossListenerRef: {
    current: null as ((info: GPUDeviceLostInfo) => void) | null,
  },
  createWebGpuSplatPsnrSessionMock: vi.fn(),
  ensureSplatPsnrWebGpuDeviceMock: vi.fn(),
  loadGaussianCloudFromFileMock: vi.fn(),
  prefetchFrustumTexturesInBackgroundMock: vi.fn(),
  subscribeSplatPsnrWebGpuDeviceLossMock: vi.fn(),
  useSplatPsnrEvaluatorStoreFacadeMock: vi.fn<() => SplatPsnrEvaluatorStoreFacade>(),
}));

vi.mock('./SplatPsnrEvaluatorStoreFacade', () => ({
  useSplatPsnrEvaluatorStoreFacade: () => useSplatPsnrEvaluatorStoreFacadeMock(),
}));

vi.mock('../../splat/webgpu/psnrSplatSession', () => ({
  createWebGpuSplatPsnrSession: createWebGpuSplatPsnrSessionMock,
}));

vi.mock('../../splat/gaussianCloudLoader', () => ({
  loadGaussianCloudFromFile: loadGaussianCloudFromFileMock,
}));

vi.mock('../../hooks/useFrustumTexture', () => ({
  prefetchFrustumTexturesInBackground: prefetchFrustumTexturesInBackgroundMock,
}));

vi.mock('./splatPsnrRuntime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./splatPsnrRuntime')>();
  return {
    ...actual,
    ensureSplatPsnrWebGpuDevice: ensureSplatPsnrWebGpuDeviceMock,
    subscribeSplatPsnrWebGpuDeviceLoss: subscribeSplatPsnrWebGpuDeviceLossMock,
  };
});

interface DeferredMetricValue {
  psnr: number;
  ssim?: number;
  mse: number;
  validPixelCount: number;
}

function createDeferredMetric() {
  let resolve!: (value: DeferredMetricValue) => void;
  const promise = new Promise<DeferredMetricValue>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createMetricCapability(): SplatMetricCapability {
  return {
    backend: 'webgpu',
    gpuPsnr: true,
    status: 'available',
    reason: 'WebGPU PSNR is available',
  };
}

function createShCloud() {
  return {
    count: 1,
    positions: new Float32Array([0, 0, 0]),
    scales: new Float32Array([1, 1, 1]),
    rotations: new Float32Array([1, 0, 0, 0]),
    opacities: new Float32Array([0.5]),
    sh0: new Float32Array([0.1, 0.2, 0.3]),
    shDegree: 3,
    shN: new Float32Array(45),
  };
}

function createFacade(overrides: Partial<SplatPsnrEvaluatorStoreFacade['data']> = {}) {
  const imageFile = buildFile('image.jpg');
  const camera = buildCamera({ width: 4, height: 3 });
  const image = buildImage({ cameraId: camera.cameraId });
  const reconstruction = buildReconstruction({ cameras: [camera], images: [image] });
  const splatFile = buildFile('scene.spz', 'splat');
  const loadedFiles = buildLoadedFiles({ imageFiles: [imageFile], splatFile });
  const actions = {
    setWebGpuMetricState: vi.fn(),
    setSplatPsnrFrameReady: vi.fn(),
    setSplatPsnrPending: vi.fn(),
    setSplatPsnrComputingImage: vi.fn(),
    setSplatPsnrMetric: vi.fn(),
    setSplatPsnrMetrics: vi.fn(),
    setSplatPsnrImageError: vi.fn(),
    requestSplatPsnrCompute: vi.fn(),
    finishSplatPsnrCompute: vi.fn(),
    addNotification: vi.fn(),
  };
  const data: SplatPsnrEvaluatorStoreFacade['data'] = {
    reconstruction,
    dataset: {
      getImageSync: vi.fn(() => imageFile),
      getImage: vi.fn(async () => imageFile),
      getMetricImage: vi.fn(async () => imageFile),
      hasMasks: vi.fn(() => false),
      getMask: vi.fn(async () => null),
      getMaskSync: vi.fn(() => undefined),
    } as unknown as SplatPsnrEvaluatorStoreFacade['data']['dataset'],
    datasetIdentity: {
      sourceType: 'local',
      imageUrlBase: '',
      maskUrlBase: '',
      loadedFiles,
    },
    splatFile,
    splatPsnrFrameReady: true,
    splatPsnrComputeRequest: { id: 1, scope: 'selected', selectedImageId: image.imageId },
    splatBackendResolution: {
      status: 'resolved',
      requested: 'webgpu',
      backend: 'webgpu',
      reason: 'WebGPU selected',
      gpuPsnr: true,
    },
    splatMetricCapability: createMetricCapability(),
    transform: {
      scale: 1,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      translationX: 0,
      translationY: 0,
      translationZ: 0,
    },
    splatTransform: {
      scale: 1,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      translationX: 0,
      translationY: 0,
      translationZ: 0,
    },
    ...overrides,
  };

  return {
    facade: {
      data,
      actions,
    } satisfies SplatPsnrEvaluatorStoreFacade,
    actions,
    image,
    imageFile,
  };
}

describe('SplatPsnrEvaluator', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    clearVisibleWebGpuSplatSharedRuntimesForTests();
  });

  beforeEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
    deviceLossListenerRef.current = null;
    loadGaussianCloudFromFileMock.mockResolvedValue({
      file: buildFile('scene.spz', 'splat'),
      format: 'spz',
      byteLength: 1,
      cloud: {
        count: 1,
        shDegree: 0,
      },
    });
    ensureSplatPsnrWebGpuDeviceMock.mockResolvedValue({ label: 'metric-device' });
    prefetchFrustumTexturesInBackgroundMock.mockResolvedValue(undefined);
    subscribeSplatPsnrWebGpuDeviceLossMock.mockImplementation((listener) => {
      deviceLossListenerRef.current = listener;
      return () => {
        if (deviceLossListenerRef.current === listener) {
          deviceLossListenerRef.current = null;
        }
      };
    });
  });

  it('stops PSNR after a systematic metric-image size mismatch instead of failing every image', async () => {
    const camera = buildCamera({ cameraId: 7, width: 4, height: 3 });
    const firstImage = buildImage({ imageId: 11, cameraId: camera.cameraId, name: 'first.jpg' });
    const secondImage = buildImage({ imageId: 12, cameraId: camera.cameraId, name: 'second.jpg' });
    const mismatch = new PsnrMetricImageDimensionMismatchError(
      'WebGPU PSNR requires an undistorted metric image matching the PINHOLE camera for first.jpg: decoded 5568x4176, camera is 4x3. Load the image set that belongs to the sparse model.'
    );
    // No submitImageMetric -> sequential path; the first image fails the size check.
    const session = {
      computeImageMetric: vi.fn().mockRejectedValue(mismatch),
      dispose: vi.fn(),
    };
    createWebGpuSplatPsnrSessionMock.mockResolvedValue(session);

    const files = new Map([
      [firstImage.name, buildFile(firstImage.name)],
      [secondImage.name, buildFile(secondImage.name)],
    ]);
    const { facade, actions } = createFacade({
      reconstruction: buildReconstruction({ cameras: [camera], images: [firstImage, secondImage] }),
      dataset: {
        getMetricImage: vi.fn(async (name: string) => files.get(name) ?? null),
        hasMasks: vi.fn(() => false),
        getMask: vi.fn(async () => null),
        getMaskSync: vi.fn(() => undefined),
      } as unknown as SplatPsnrEvaluatorStoreFacade['data']['dataset'],
      splatPsnrComputeRequest: { id: 1, scope: 'all' },
    });
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);
    const warnSpy = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);

    render(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(actions.setSplatPsnrImageError).toHaveBeenCalledWith(secondImage.imageId, expect.any(String));
    });

    // The second image is skipped (never computed) once the first mismatch is seen.
    expect(session.computeImageMetric).toHaveBeenCalledTimes(1);
    expect(actions.setSplatPsnrImageError).toHaveBeenCalledWith(
      firstImage.imageId,
      expect.stringContaining('undistorted metric image')
    );
    expect(actions.setSplatPsnrImageError).toHaveBeenCalledWith(
      secondImage.imageId,
      expect.stringContaining('do not match the sparse model')
    );

    // The per-image flood collapses to a single summary warning.
    const psnrWarnings = warnSpy.mock.calls.filter(
      ([message]) => typeof message === 'string' && message.includes('[PSNR]')
    );
    expect(psnrWarnings).toHaveLength(1);
    expect(psnrWarnings[0][0]).toContain('Skipping the remaining images');

    warnSpy.mockRestore();
  });

  it('automatically requests all-image metrics for SPZ splats once the WebGPU scene is metric-ready', async () => {
    vi.useFakeTimers();
    const { facade, actions } = createFacade({
      splatPsnrComputeRequest: null,
    });
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    render(<SplatPsnrEvaluator />);

    expect(actions.requestSplatPsnrCompute).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(actions.requestSplatPsnrCompute).toHaveBeenCalledWith('all');
  });

  it('does not request SPZ metrics when the visible renderer is using Spark fallback', async () => {
    vi.useFakeTimers();
    const splatFile = buildFile('scene.spz', 'splat');
    const { facade, actions, imageFile } = createFacade({
      splatFile,
      splatPsnrComputeRequest: null,
      splatBackendResolution: {
        status: 'resolved',
        requested: 'auto',
        backend: 'spark',
        reason: 'Spark fallback selected because WebGPU splat renderer failed to initialize: adapter lost',
        gpuPsnr: false,
      },
    });
    facade.data.datasetIdentity = {
      ...facade.data.datasetIdentity,
      loadedFiles: buildLoadedFiles({ imageFiles: [imageFile], splatFile }),
    };
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    render(<SplatPsnrEvaluator />);

    expect(actions.requestSplatPsnrCompute).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(actions.requestSplatPsnrCompute).not.toHaveBeenCalled();
    expect(prefetchFrustumTexturesInBackgroundMock).not.toHaveBeenCalled();
  });

  it('does not probe the PSNR WebGPU device before the visible WebGPU renderer is ready', async () => {
    const { facade } = createFacade({
      splatBackendResolution: {
        status: 'unavailable',
        requested: 'auto',
        backend: null,
        reason: 'Preparing WebGPU splat renderer',
        gpuPsnr: false,
      },
      splatMetricCapability: {
        backend: null,
        gpuPsnr: false,
        status: 'unavailable',
        reason: 'WebGPU PSNR is not ready',
      },
    });
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    render(<SplatPsnrEvaluator />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(ensureSplatPsnrWebGpuDeviceMock).not.toHaveBeenCalled();
    expect(loadGaussianCloudFromFileMock).not.toHaveBeenCalled();
    expect(createWebGpuSplatPsnrSessionMock).not.toHaveBeenCalled();
    expect(prefetchFrustumTexturesInBackgroundMock).not.toHaveBeenCalled();
  });

  it('does not request background metrics for splat-only scenes without ground truth images', async () => {
    vi.useFakeTimers();
    const splatFile = buildFile('scene.spz', 'splat');
    const { facade, actions } = createFacade({
      reconstruction: buildReconstruction({ cameras: [], images: [] }),
      splatFile,
      splatPsnrComputeRequest: null,
    });
    facade.data.datasetIdentity = {
      ...facade.data.datasetIdentity,
      loadedFiles: buildLoadedFiles({ splatFile }),
    };
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    render(<SplatPsnrEvaluator />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(actions.requestSplatPsnrCompute).not.toHaveBeenCalled();
    expect(prefetchFrustumTexturesInBackgroundMock).not.toHaveBeenCalled();
  });

  it('starts gentle image-plane texture prefetch for the loaded scene', async () => {
    const { facade, image, imageFile } = createFacade({
      splatPsnrFrameReady: false,
      splatPsnrComputeRequest: null,
    });
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    render(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(prefetchFrustumTexturesInBackgroundMock).toHaveBeenCalledWith(
        [{ file: imageFile, name: image.name }],
        expect.objectContaining({
          shouldCancel: expect.any(Function),
        })
      );
    });
  });

  it('warms image-plane textures from metric files while preparing PSNR images', async () => {
    const deferredMetric = createDeferredMetric();
    const computeImageMetric = vi.fn(() => deferredMetric.promise);
    createWebGpuSplatPsnrSessionMock.mockResolvedValue({
      computeImageMetric,
      dispose: vi.fn(),
    });
    const metricFile = buildFile('metric-only.jpg');
    const camera = buildCamera({ width: 4, height: 3 });
    const image = buildImage({
      cameraId: camera.cameraId,
      name: 'metric-only.jpg',
    });
    const { facade } = createFacade({
      reconstruction: buildReconstruction({ cameras: [camera], images: [image] }),
      dataset: {
        getImageSync: vi.fn(() => undefined),
        getImage: vi.fn(async () => null),
        getMetricImage: vi.fn(async () => metricFile),
        hasMasks: vi.fn(() => false),
        getMask: vi.fn(async () => null),
        getMaskSync: vi.fn(() => undefined),
      } as unknown as SplatPsnrEvaluatorStoreFacade['data']['dataset'],
      splatPsnrComputeRequest: { id: 1, scope: 'selected', selectedImageId: image.imageId },
    });
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    render(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(loadGaussianCloudFromFileMock).toHaveBeenCalledTimes(1);
      expect(createWebGpuSplatPsnrSessionMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(computeImageMetric).toHaveBeenCalledTimes(1);
      expect(computeImageMetric).toHaveBeenCalledWith(expect.objectContaining({
        imageFile: metricFile,
      }));
    });
    await waitFor(() => {
      expect(prefetchFrustumTexturesInBackgroundMock).toHaveBeenCalledWith(
        [{ file: metricFile, name: image.name }],
        expect.objectContaining({
          batchSize: 1,
          shouldCancel: expect.any(Function),
        })
      );
    });
  });

  it('passes dataset masks into masked PSNR and SSIM image metrics', async () => {
    const deferredMetric = createDeferredMetric();
    const computeImageMetric = vi.fn(() => deferredMetric.promise);
    createWebGpuSplatPsnrSessionMock.mockResolvedValue({
      computeImageMetric,
      dispose: vi.fn(),
    });
    const maskFile = buildFile('image.jpg.png', 'mask');
    const { facade, image, imageFile } = createFacade({
      dataset: {
        getImageSync: vi.fn(() => imageFile),
        getImage: vi.fn(async () => imageFile),
        getMetricImage: vi.fn(async () => imageFile),
        hasMasks: vi.fn(() => true),
        getMask: vi.fn(async () => maskFile),
        getMaskSync: vi.fn(() => maskFile),
      } as unknown as SplatPsnrEvaluatorStoreFacade['data']['dataset'],
    });
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    render(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(computeImageMetric).toHaveBeenCalledTimes(1);
    });
    expect(facade.data.dataset.getMask).toHaveBeenCalledWith(image.name);
    expect(computeImageMetric).toHaveBeenCalledWith(expect.objectContaining({
      imageFile,
      maskFile,
      image,
      width: 4,
      height: 3,
    }));
  });

  it('retries PSNR setup with SH0-only data when full SH exceeds WebGPU limits', async () => {
    const splatFile = buildFile('scene.ply', 'splat');
    const shCloud = createShCloud();
    const deferredMetric = createDeferredMetric();
    const computeImageMetric = vi.fn(() => deferredMetric.promise);
    createWebGpuSplatPsnrSessionMock.mockResolvedValue({
      computeImageMetric,
      dispose: vi.fn(),
    });
    loadGaussianCloudFromFileMock.mockResolvedValueOnce({
      file: splatFile,
      format: 'ply',
      byteLength: 123,
      cloud: shCloud,
    });
    const fallbackDevice = { label: 'fallback-device' } as unknown as GPUDevice;
    ensureSplatPsnrWebGpuDeviceMock
      .mockRejectedValueOnce(new Error('maxStorageBufferBindingSize is below required size'))
      .mockResolvedValueOnce(fallbackDevice);
    const { facade, imageFile } = createFacade({
      splatFile,
    });
    facade.data.datasetIdentity = {
      ...facade.data.datasetIdentity,
      loadedFiles: buildLoadedFiles({ imageFiles: [imageFile], splatFile }),
    };
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    render(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(createWebGpuSplatPsnrSessionMock).toHaveBeenCalledTimes(1);
    });
    expect(ensureSplatPsnrWebGpuDeviceMock).toHaveBeenNthCalledWith(1, {
      maxBufferSize: 180,
      maxStorageBufferBindingSize: 180,
    });
    expect(ensureSplatPsnrWebGpuDeviceMock).toHaveBeenNthCalledWith(2, {
      maxBufferSize: 64,
      maxStorageBufferBindingSize: 64,
    });
    const sessionOptions = createWebGpuSplatPsnrSessionMock.mock.calls[0][0];
    expect(sessionOptions.device).toBe(fallbackDevice);
    expect(sessionOptions.loadedCloud.cloud).not.toBe(shCloud);
    expect(sessionOptions.loadedCloud.cloud.shDegree).toBe(0);
    expect(sessionOptions.loadedCloud.cloud.shN).toBeUndefined();
    expect(shCloud.shDegree).toBe(3);

    await act(async () => {
      deferredMetric.resolve({ psnr: 31, ssim: 0.94, mse: 12, validPixelCount: 12 });
      await deferredMetric.promise;
    });
  });

  it('keeps an in-flight metric request alive when viewer transform changes', async () => {
    const deferredMetric = createDeferredMetric();
    const computeImageMetric = vi.fn(() => deferredMetric.promise);
    const dispose = vi.fn();
    createWebGpuSplatPsnrSessionMock.mockResolvedValue({
      computeImageMetric,
      dispose,
    });
    const { facade, actions, image, imageFile } = createFacade();
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    const view = render(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(computeImageMetric).toHaveBeenCalledTimes(1);
    });
    expect(computeImageMetric).toHaveBeenCalledWith(expect.objectContaining({
      imageFile,
      image,
      width: 4,
      height: 3,
      transform: expect.objectContaining({ scale: 1 }),
      modelTransform: undefined,
    }));

    facade.data.transform = {
      scale: 2,
      rotationX: 0.1,
      rotationY: -0.2,
      rotationZ: 0.3,
      translationX: 1,
      translationY: 2,
      translationZ: 3,
    };
    view.rerender(<SplatPsnrEvaluator />);

    expect(createWebGpuSplatPsnrSessionMock).toHaveBeenCalledTimes(1);
    expect(computeImageMetric).toHaveBeenCalledTimes(1);
    expect(dispose).not.toHaveBeenCalled();
    expect(actions.finishSplatPsnrCompute).not.toHaveBeenCalled();

    await act(async () => {
      deferredMetric.resolve({ psnr: 31, ssim: 0.94, mse: 12, validPixelCount: 12 });
      await deferredMetric.promise;
    });

    await waitFor(() => {
      expect(actions.setSplatPsnrMetric).toHaveBeenCalledWith(expect.objectContaining({
        imageId: image.imageId,
        psnr: 31,
        ssim: 0.94,
        mse: 12,
        validPixelCount: 12,
        width: 4,
        height: 3,
      }));
      expect(actions.finishSplatPsnrCompute).toHaveBeenCalledTimes(1);
    });
    expect(dispose).not.toHaveBeenCalled();
    view.unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('notifies when an in-flight run is cancelled by a reconstruction change', async () => {
    const deferredMetric = createDeferredMetric();
    const computeImageMetric = vi.fn(() => deferredMetric.promise);
    createWebGpuSplatPsnrSessionMock.mockResolvedValue({
      computeImageMetric,
      dispose: vi.fn(),
    });
    const { facade, actions } = createFacade();
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    const view = render(<SplatPsnrEvaluator />);
    await waitFor(() => {
      expect(computeImageMetric).toHaveBeenCalledTimes(1);
    });

    const camera = buildCamera({ width: 4, height: 3 });
    const image = buildImage({ cameraId: camera.cameraId });
    facade.data.reconstruction = buildReconstruction({ cameras: [camera], images: [image] });
    view.rerender(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(actions.finishSplatPsnrCompute).toHaveBeenCalled();
    });
    // A silent stop reads as a bug (user report 2026-07-12); the interruption
    // must be surfaced with its reason.
    expect(actions.addNotification).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('reconstruction changed')
    );
    view.unmount();
  });

  it('notifies when the WebGPU device is lost mid-run', async () => {
    const deferredMetric = createDeferredMetric();
    const computeImageMetric = vi.fn(() => deferredMetric.promise);
    createWebGpuSplatPsnrSessionMock.mockResolvedValue({
      computeImageMetric,
      dispose: vi.fn(),
    });
    const { facade, actions } = createFacade();
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    const view = render(<SplatPsnrEvaluator />);
    await waitFor(() => {
      expect(computeImageMetric).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      deviceLossListenerRef.current?.({
        reason: 'destroyed',
        message: 'GPU hung',
      } as GPUDeviceLostInfo);
    });

    expect(actions.setWebGpuMetricState).toHaveBeenCalledWith(
      'failed',
      expect.stringContaining('GPU hung')
    );
    // 'warning' is the persistent notification tier in this app (no 'error').
    expect(actions.addNotification).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('device was lost')
    );
    view.unmount();
  });

  it('notifies when the compute request is cleared out from under an active run', async () => {
    const deferredMetric = createDeferredMetric();
    const computeImageMetric = vi.fn(() => deferredMetric.promise);
    createWebGpuSplatPsnrSessionMock.mockResolvedValue({
      computeImageMetric,
      dispose: vi.fn(),
    });
    const { facade, actions } = createFacade();
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    const view = render(<SplatPsnrEvaluator />);
    await waitFor(() => {
      expect(computeImageMetric).toHaveBeenCalledTimes(1);
    });

    facade.data.splatPsnrComputeRequest = null;
    view.rerender(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(actions.addNotification).toHaveBeenCalledWith(
        'warning',
        expect.stringContaining('compute request was cleared')
      );
    });
    view.unmount();
  });

  it('does not emit a stopped notification when a new request replaces the run', async () => {
    const deferredMetric = createDeferredMetric();
    const computeImageMetric = vi.fn(() => deferredMetric.promise);
    createWebGpuSplatPsnrSessionMock.mockResolvedValue({
      computeImageMetric,
      dispose: vi.fn(),
    });
    const { facade, actions, image } = createFacade();
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    const view = render(<SplatPsnrEvaluator />);
    await waitFor(() => {
      expect(computeImageMetric).toHaveBeenCalledTimes(1);
    });

    // The user re-triggering a compute is an intentional replacement, not an
    // interruption worth a toast.
    facade.data.splatPsnrComputeRequest = { id: 2, scope: 'selected', selectedImageId: image.imageId };
    view.rerender(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(computeImageMetric).toHaveBeenCalledTimes(2);
    });
    expect(actions.addNotification).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('stopped')
    );
    view.unmount();
  });

  it('passes the published composed splat model transform into PSNR requests', async () => {
    const deferredMetric = createDeferredMetric();
    const computeImageMetric = vi.fn(() => deferredMetric.promise);
    createWebGpuSplatPsnrSessionMock.mockResolvedValue({
      computeImageMetric,
      dispose: vi.fn(),
    });
    const { facade, image } = createFacade({
      transform: {
        scale: 2,
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
        translationX: 1,
        translationY: 0,
        translationZ: 0,
      },
      splatTransform: {
        scale: 1,
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
        translationX: 0,
        translationY: 2,
        translationZ: 0,
      },
    });
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    render(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(computeImageMetric).toHaveBeenCalledTimes(1);
    });
    expect(computeImageMetric).toHaveBeenCalledWith(expect.objectContaining({
      transform: expect.objectContaining({
        scale: 2,
        translationX: 1,
        translationY: 0,
      }),
      modelTransform: expect.objectContaining({
        scale: 2,
        translationX: 1,
        translationY: 4,
      }),
    }));

    await act(async () => {
      deferredMetric.resolve({ psnr: 31, ssim: 0.94, mse: 12, validPixelCount: 12 });
      await deferredMetric.promise;
    });

    await waitFor(() => {
      expect(facade.actions.setSplatPsnrMetric).toHaveBeenCalledWith(expect.objectContaining({
        imageId: image.imageId,
      }));
    });
  });

  it('passes the scene transform as the model transform when no splat transform exists', async () => {
    const deferredMetric = createDeferredMetric();
    const computeImageMetric = vi.fn(() => deferredMetric.promise);
    createWebGpuSplatPsnrSessionMock.mockResolvedValue({
      computeImageMetric,
      dispose: vi.fn(),
    });
    const { facade, image } = createFacade({
      transform: {
        scale: 2,
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
        translationX: 1,
        translationY: 0,
        translationZ: 0,
      },
    });
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    render(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(computeImageMetric).toHaveBeenCalledTimes(1);
    });
    expect(computeImageMetric).toHaveBeenCalledWith(expect.objectContaining({
      transform: expect.objectContaining({
        scale: 2,
        translationX: 1,
      }),
      modelTransform: expect.objectContaining({
        scale: 2,
        translationX: 1,
        translationY: 0,
      }),
    }));

    await act(async () => {
      deferredMetric.resolve({ psnr: 31, ssim: 0.94, mse: 12, validPixelCount: 12 });
      await deferredMetric.promise;
    });

    await waitFor(() => {
      expect(facade.actions.setSplatPsnrMetric).toHaveBeenCalledWith(expect.objectContaining({
        imageId: image.imageId,
      }));
    });
  });

  it('publishes only the latest metric request when an older request resolves late', async () => {
    const firstMetric = createDeferredMetric();
    const secondMetric = createDeferredMetric();
    const firstSession = {
      computeImageMetric: vi.fn(() => firstMetric.promise),
      dispose: vi.fn(),
    };
    const secondSession = {
      computeImageMetric: vi.fn(() => secondMetric.promise),
      dispose: vi.fn(),
    };
    createWebGpuSplatPsnrSessionMock
      .mockResolvedValueOnce(firstSession)
      .mockResolvedValueOnce(secondSession);
    const { facade, actions, image } = createFacade();
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    const view = render(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(firstSession.computeImageMetric).toHaveBeenCalledTimes(1);
    });

    facade.data.splatPsnrComputeRequest = {
      id: 2,
      scope: 'selected',
      selectedImageId: image.imageId,
    };
    view.rerender(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(secondSession.computeImageMetric).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      firstMetric.resolve({ psnr: 18, mse: 90, validPixelCount: 12 });
      await firstMetric.promise;
    });

    await waitFor(() => {
      expect(firstSession.dispose).toHaveBeenCalledTimes(1);
    });
    expect(actions.setSplatPsnrMetric).not.toHaveBeenCalled();
    expect(actions.finishSplatPsnrCompute).not.toHaveBeenCalled();

    await act(async () => {
      secondMetric.resolve({ psnr: 42, mse: 4, validPixelCount: 12 });
      await secondMetric.promise;
    });

    await waitFor(() => {
      expect(actions.setSplatPsnrMetric).toHaveBeenCalledTimes(1);
      expect(actions.setSplatPsnrMetric).toHaveBeenCalledWith(expect.objectContaining({
        imageId: image.imageId,
        psnr: 42,
        mse: 4,
        validPixelCount: 12,
      }));
      expect(actions.finishSplatPsnrCompute).toHaveBeenCalledTimes(1);
    });
    expect(secondSession.dispose).not.toHaveBeenCalled();
    view.unmount();
    expect(secondSession.dispose).toHaveBeenCalledTimes(1);
  });

  it('publishes low-PSNR metrics without diagnostic metadata', async () => {
    const deferredMetric = createDeferredMetric();
    const computeImageMetric = vi.fn(() => deferredMetric.promise);
    const dispose = vi.fn();
    createWebGpuSplatPsnrSessionMock.mockResolvedValue({
      computeImageMetric,
      dispose,
    });
    const camera = buildCamera({
      cameraId: 77,
      modelId: 1,
      width: 4000,
      height: 3000,
    });
    const image = buildImage({
      imageId: 17,
      cameraId: camera.cameraId,
      name: 'diagnostic.jpg',
    });
    const { facade, actions } = createFacade({
      reconstruction: buildReconstruction({ cameras: [camera], images: [image] }),
      splatPsnrComputeRequest: { id: 1, scope: 'selected', selectedImageId: image.imageId },
    });
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    const view = render(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(computeImageMetric).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      deferredMetric.resolve({
        psnr: 15,
        mse: 100,
        validPixelCount: 1_500,
      });
      await deferredMetric.promise;
    });

    await waitFor(() => {
      expect(actions.setSplatPsnrMetric).toHaveBeenCalledWith(expect.objectContaining({
        imageId: image.imageId,
        psnr: 15,
        renderBackground: {
          label: 'opaque-black',
          rgba: [0, 0, 0, 1],
        },
      }));
      expect(actions.setSplatPsnrMetric).not.toHaveBeenCalledWith(expect.objectContaining({
        diagnostics: expect.anything(),
      }));
    });
    expect(dispose).not.toHaveBeenCalled();
    view.unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('reuses a completed PSNR render session for later requests with the same data', async () => {
    const firstMetric = createDeferredMetric();
    const secondMetric = createDeferredMetric();
    const session = {
      computeImageMetric: vi.fn()
        .mockReturnValueOnce(firstMetric.promise)
        .mockReturnValueOnce(secondMetric.promise),
      dispose: vi.fn(),
    };
    createWebGpuSplatPsnrSessionMock.mockResolvedValue(session);
    const { facade, actions, image } = createFacade();
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    const view = render(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(session.computeImageMetric).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      firstMetric.resolve({ psnr: 31, mse: 12, validPixelCount: 12 });
      await firstMetric.promise;
    });

    await waitFor(() => {
      expect(actions.finishSplatPsnrCompute).toHaveBeenCalledTimes(1);
    });
    expect(session.dispose).not.toHaveBeenCalled();

    facade.data.splatPsnrComputeRequest = {
      id: 2,
      scope: 'selected',
      selectedImageId: image.imageId,
    };
    view.rerender(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(session.computeImageMetric).toHaveBeenCalledTimes(2);
    });
    expect(createWebGpuSplatPsnrSessionMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      secondMetric.resolve({ psnr: 32, mse: 10, validPixelCount: 12 });
      await secondMetric.promise;
    });

    await waitFor(() => {
      expect(actions.setSplatPsnrMetric).toHaveBeenCalledTimes(2);
      expect(actions.finishSplatPsnrCompute).toHaveBeenCalledTimes(2);
    });

    view.unmount();
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });

  it('pipelines all-image requests through submitted metric handles', async () => {
    const firstMetric = createDeferredMetric();
    const secondMetric = createDeferredMetric();
    const firstSubmitted = {
      result: firstMetric.promise,
      dispose: vi.fn(),
    };
    const secondSubmitted = {
      result: secondMetric.promise,
      dispose: vi.fn(),
    };
    const session = {
      computeImageMetric: vi.fn(),
      submitImageMetric: vi.fn()
        .mockResolvedValueOnce(firstSubmitted)
        .mockResolvedValueOnce(secondSubmitted),
      dispose: vi.fn(),
    };
    createWebGpuSplatPsnrSessionMock.mockResolvedValue(session);
    const camera = buildCamera({ cameraId: 7, width: 4, height: 3 });
    const firstImage = buildImage({ imageId: 11, cameraId: camera.cameraId, name: 'first.jpg' });
    const secondImage = buildImage({ imageId: 12, cameraId: camera.cameraId, name: 'second.jpg' });
    const files = new Map([
      [firstImage.name, buildFile(firstImage.name)],
      [secondImage.name, buildFile(secondImage.name)],
    ]);
    const { facade, actions } = createFacade({
      reconstruction: buildReconstruction({
        cameras: [camera],
        images: [firstImage, secondImage],
      }),
      dataset: {
        getMetricImage: vi.fn(async (name: string) => files.get(name) ?? null),
        hasMasks: vi.fn(() => false),
        getMask: vi.fn(async () => null),
        getMaskSync: vi.fn(() => undefined),
      } as unknown as SplatPsnrEvaluatorStoreFacade['data']['dataset'],
      splatPsnrComputeRequest: { id: 1, scope: 'all' },
    });
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    render(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(session.submitImageMetric).toHaveBeenCalledTimes(2);
    });
    expect(session.submitImageMetric).toHaveBeenNthCalledWith(1, expect.objectContaining({
      image: firstImage,
    }));
    expect(session.submitImageMetric).toHaveBeenNthCalledWith(2, expect.objectContaining({
      image: secondImage,
    }));
    expect(session.computeImageMetric).not.toHaveBeenCalled();
    expect(actions.setSplatPsnrPending).toHaveBeenCalledWith([firstImage.imageId, secondImage.imageId]);
    expect(actions.setSplatPsnrComputingImage).not.toHaveBeenCalled();
    expect(actions.setSplatPsnrMetric).not.toHaveBeenCalled();
    expect(actions.setSplatPsnrMetrics).not.toHaveBeenCalled();
    expect(actions.finishSplatPsnrCompute).not.toHaveBeenCalled();

    await act(async () => {
      secondMetric.resolve({ psnr: 29, mse: 6, validPixelCount: 12 });
      await secondMetric.promise;
    });

    await waitFor(() => {
      expect(actions.setSplatPsnrMetrics).toHaveBeenCalledWith([
        expect.objectContaining({
          imageId: secondImage.imageId,
          psnr: 29,
        }),
      ]);
    });
    expect(actions.finishSplatPsnrCompute).not.toHaveBeenCalled();

    await act(async () => {
      firstMetric.resolve({ psnr: 31, mse: 4, validPixelCount: 12 });
      await firstMetric.promise;
    });

    await waitFor(() => {
      expect(actions.setSplatPsnrMetrics).toHaveBeenCalledWith([
        expect.objectContaining({
          imageId: firstImage.imageId,
          psnr: 31,
        }),
      ]);
      expect(actions.finishSplatPsnrCompute).toHaveBeenCalledTimes(1);
    });
    expect(firstSubmitted.dispose).toHaveBeenCalledTimes(1);
    expect(secondSubmitted.dispose).toHaveBeenCalledTimes(1);
    expect(session.dispose).not.toHaveBeenCalled();
  });

  it('cancels an in-flight metric request when the splat file changes', async () => {
    const deferredMetric = createDeferredMetric();
    const computeImageMetric = vi.fn(() => deferredMetric.promise);
    const dispose = vi.fn();
    createWebGpuSplatPsnrSessionMock.mockResolvedValue({
      computeImageMetric,
      dispose,
    });
    const { facade, actions } = createFacade();
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    const view = render(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(computeImageMetric).toHaveBeenCalledTimes(1);
    });

    facade.data.splatFile = buildFile('replacement.spz', 'splat');
    view.rerender(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(actions.finishSplatPsnrCompute).toHaveBeenCalledTimes(1);
    });
    expect(createWebGpuSplatPsnrSessionMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferredMetric.resolve({ psnr: 35, mse: 8, validPixelCount: 12 });
      await deferredMetric.promise;
    });

    expect(actions.setSplatPsnrMetric).not.toHaveBeenCalled();
    expect(actions.finishSplatPsnrCompute).toHaveBeenCalledTimes(1);
  });

  it('keeps an in-flight metric request alive when only the dataset manager object changes', async () => {
    const deferredMetric = createDeferredMetric();
    const computeImageMetric = vi.fn(() => deferredMetric.promise);
    const dispose = vi.fn();
    createWebGpuSplatPsnrSessionMock.mockResolvedValue({
      computeImageMetric,
      dispose,
    });
    const { facade, actions } = createFacade();
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    const view = render(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(computeImageMetric).toHaveBeenCalledTimes(1);
    });

    facade.data.dataset = {
      getMetricImage: vi.fn(async () => buildFile('replacement.jpg')),
    } as unknown as SplatPsnrEvaluatorStoreFacade['data']['dataset'];
    view.rerender(<SplatPsnrEvaluator />);

    expect(dispose).not.toHaveBeenCalled();
    expect(actions.finishSplatPsnrCompute).not.toHaveBeenCalled();
    expect(createWebGpuSplatPsnrSessionMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferredMetric.resolve({ psnr: 35, mse: 8, validPixelCount: 12 });
      await deferredMetric.promise;
    });

    await waitFor(() => {
      expect(actions.setSplatPsnrMetric).toHaveBeenCalledTimes(1);
    });
    expect(actions.finishSplatPsnrCompute).toHaveBeenCalledTimes(1);
    expect(dispose).not.toHaveBeenCalled();
    view.unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('cancels an in-flight metric request when the dataset source identity changes', async () => {
    const deferredMetric = createDeferredMetric();
    const computeImageMetric = vi.fn(() => deferredMetric.promise);
    const dispose = vi.fn();
    createWebGpuSplatPsnrSessionMock.mockResolvedValue({
      computeImageMetric,
      dispose,
    });
    const { facade, actions } = createFacade();
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    const view = render(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(computeImageMetric).toHaveBeenCalledTimes(1);
    });

    const replacementImageFile = buildFile('replacement.jpg');
    facade.data.dataset = {
      getMetricImage: vi.fn(async () => replacementImageFile),
    } as unknown as SplatPsnrEvaluatorStoreFacade['data']['dataset'];
    facade.data.datasetIdentity = {
      ...facade.data.datasetIdentity,
      loadedFiles: buildLoadedFiles({ imageFiles: [replacementImageFile], splatFile: facade.data.splatFile }),
    };
    view.rerender(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(actions.finishSplatPsnrCompute).toHaveBeenCalledTimes(1);
    });
    expect(createWebGpuSplatPsnrSessionMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferredMetric.resolve({ psnr: 35, mse: 8, validPixelCount: 12 });
      await deferredMetric.promise;
    });

    expect(actions.setSplatPsnrMetric).not.toHaveBeenCalled();
    expect(actions.finishSplatPsnrCompute).toHaveBeenCalledTimes(1);
  });

  it('cancels an in-flight metric request when the reconstruction changes', async () => {
    const deferredMetric = createDeferredMetric();
    const computeImageMetric = vi.fn(() => deferredMetric.promise);
    const dispose = vi.fn();
    createWebGpuSplatPsnrSessionMock.mockResolvedValue({
      computeImageMetric,
      dispose,
    });
    const { facade, actions } = createFacade();
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    const view = render(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(computeImageMetric).toHaveBeenCalledTimes(1);
    });

    const replacementCamera = buildCamera({ cameraId: 22, width: 4, height: 3 });
    const replacementImage = buildImage({ imageId: 222, cameraId: replacementCamera.cameraId });
    facade.data.reconstruction = buildReconstruction({
      cameras: [replacementCamera],
      images: [replacementImage],
    });
    view.rerender(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(actions.finishSplatPsnrCompute).toHaveBeenCalledTimes(1);
    });
    expect(createWebGpuSplatPsnrSessionMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferredMetric.resolve({ psnr: 35, mse: 8, validPixelCount: 12 });
      await deferredMetric.promise;
    });

    expect(actions.setSplatPsnrMetric).not.toHaveBeenCalled();
    expect(actions.finishSplatPsnrCompute).toHaveBeenCalledTimes(1);
  });

  it('cancels an in-flight metric request when the metric WebGPU device is lost', async () => {
    const deferredMetric = createDeferredMetric();
    const computeImageMetric = vi.fn(() => deferredMetric.promise);
    const dispose = vi.fn();
    createWebGpuSplatPsnrSessionMock.mockResolvedValue({
      computeImageMetric,
      dispose,
    });
    const { facade, actions } = createFacade();
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    render(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(computeImageMetric).toHaveBeenCalledTimes(1);
      expect(deviceLossListenerRef.current).toBeTypeOf('function');
    });

    act(() => {
      deviceLossListenerRef.current?.({
        message: 'adapter reset',
        reason: 'unknown',
      } as GPUDeviceLostInfo);
    });

    expect(actions.setWebGpuMetricState).toHaveBeenCalledWith(
      'failed',
      'WebGPU PSNR device was lost: adapter reset'
    );
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(actions.finishSplatPsnrCompute).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferredMetric.resolve({ psnr: 35, mse: 8, validPixelCount: 12 });
      await deferredMetric.promise;
    });

    expect(actions.setSplatPsnrMetric).not.toHaveBeenCalled();
    expect(actions.finishSplatPsnrCompute).toHaveBeenCalledTimes(1);
  });

  it('waits for visible WebGPU resources after device loss and accepts a later request once ready', async () => {
    const firstMetric = createDeferredMetric();
    const secondMetric = createDeferredMetric();
    const firstSession = {
      computeImageMetric: vi.fn(() => firstMetric.promise),
      dispose: vi.fn(),
    };
    const secondSession = {
      computeImageMetric: vi.fn(() => secondMetric.promise),
      dispose: vi.fn(),
    };
    createWebGpuSplatPsnrSessionMock
      .mockResolvedValueOnce(firstSession)
      .mockResolvedValueOnce(secondSession);
    const { facade, actions, image } = createFacade();
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    const view = render(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(firstSession.computeImageMetric).toHaveBeenCalledTimes(1);
      expect(ensureSplatPsnrWebGpuDeviceMock).toHaveBeenCalledTimes(1);
      expect(deviceLossListenerRef.current).toBeTypeOf('function');
    });

    act(() => {
      deviceLossListenerRef.current?.({
        message: 'adapter reset',
        reason: 'unknown',
      } as GPUDeviceLostInfo);
    });

    expect(actions.setWebGpuMetricState).toHaveBeenCalledWith(
      'failed',
      'WebGPU PSNR device was lost: adapter reset'
    );
    expect(firstSession.dispose).toHaveBeenCalledTimes(1);
    expect(actions.finishSplatPsnrCompute).toHaveBeenCalledTimes(1);

    facade.data.splatMetricCapability = {
      status: 'unavailable',
      backend: null,
      gpuPsnr: false,
      reason: 'WebGPU PSNR failed to initialize: adapter reset',
    };
    facade.data.splatPsnrFrameReady = false;
    registerVisibleWebGpuSplatSharedRuntime({
      sceneId: createVisibleWebGpuSplatSceneId(facade.data.splatFile!),
      device: { label: 'visible-device' } as unknown as GPUDevice,
      sceneResourceManager: {
        acquire: vi.fn(),
      },
    });
    view.rerender(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(ensureSplatPsnrWebGpuDeviceMock).toHaveBeenCalledTimes(1);
      expect(actions.setWebGpuMetricState).toHaveBeenCalledWith('ready');
    });

    await act(async () => {
      firstMetric.resolve({ psnr: 35, mse: 8, validPixelCount: 12 });
      await firstMetric.promise;
    });
    expect(actions.setSplatPsnrMetric).not.toHaveBeenCalled();

    facade.data.splatMetricCapability = createMetricCapability();
    facade.data.splatPsnrFrameReady = true;
    facade.data.splatPsnrComputeRequest = {
      id: 2,
      scope: 'selected',
      selectedImageId: image.imageId,
    };
    view.rerender(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(secondSession.computeImageMetric).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      secondMetric.resolve({ psnr: 44, mse: 3, validPixelCount: 12 });
      await secondMetric.promise;
    });

    await waitFor(() => {
      expect(actions.setSplatPsnrMetric).toHaveBeenCalledTimes(1);
      expect(actions.setSplatPsnrMetric).toHaveBeenCalledWith(expect.objectContaining({
        imageId: image.imageId,
        psnr: 44,
        mse: 3,
        validPixelCount: 12,
      }));
    });
    expect(secondSession.dispose).not.toHaveBeenCalled();
    view.unmount();
    expect(secondSession.dispose).toHaveBeenCalledTimes(1);
  });

  it('skips EQUIRECTANGULAR (spherical) cameras in scope=all without setting any PSNR error for them', async () => {
    const pinholeCamera = buildCamera({ cameraId: 1, width: 4, height: 3 });
    const sphericalCamera = buildCamera({
      cameraId: 2,
      modelId: CameraModelId.EQUIRECTANGULAR,
      width: 3840,
      height: 1920,
      params: [3840, 1920],
    });
    const pinholeImage = buildImage({ imageId: 10, cameraId: pinholeCamera.cameraId, name: 'pinhole.jpg' });
    const sphericalImage = buildImage({ imageId: 20, cameraId: sphericalCamera.cameraId, name: 'equirect.jpg' });
    const reconstruction = buildReconstruction({
      cameras: [pinholeCamera, sphericalCamera],
      images: [pinholeImage, sphericalImage],
    });
    const pinholeFile = buildFile(pinholeImage.name);
    const session = {
      computeImageMetric: vi.fn().mockResolvedValue({ psnr: 30, mse: 10, validPixelCount: 12 }),
      dispose: vi.fn(),
    };
    createWebGpuSplatPsnrSessionMock.mockResolvedValue(session);

    const { facade, actions } = createFacade({
      reconstruction,
      dataset: {
        getImageSync: vi.fn((name: string) => (name === pinholeImage.name ? pinholeFile : undefined)),
        getImage: vi.fn(async (name: string) => (name === pinholeImage.name ? pinholeFile : null)),
        getMetricImage: vi.fn(async (name: string) => (name === pinholeImage.name ? pinholeFile : null)),
        hasMasks: vi.fn(() => false),
        getMask: vi.fn(async () => null),
        getMaskSync: vi.fn(() => undefined),
      } as unknown as SplatPsnrEvaluatorStoreFacade['data']['dataset'],
      splatPsnrComputeRequest: { id: 1, scope: 'all' },
    });
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    render(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(actions.finishSplatPsnrCompute).toHaveBeenCalledTimes(1);
    });

    // Only the pinhole image enters the pending queue — the spherical image is filtered upstream.
    expect(actions.setSplatPsnrPending).toHaveBeenCalledWith([pinholeImage.imageId]);
    expect(actions.setSplatPsnrPending).not.toHaveBeenCalledWith(
      expect.arrayContaining([sphericalImage.imageId])
    );

    // The pinhole image gets a metric; the spherical image gets neither metric nor error.
    expect(actions.setSplatPsnrMetric).toHaveBeenCalledWith(
      expect.objectContaining({ imageId: pinholeImage.imageId })
    );
    expect(actions.setSplatPsnrMetric).not.toHaveBeenCalledWith(
      expect.objectContaining({ imageId: sphericalImage.imageId })
    );
    expect(actions.setSplatPsnrImageError).not.toHaveBeenCalledWith(
      sphericalImage.imageId,
      expect.any(String)
    );
  });

  it('notifies once when a compute-all excludes unsupported cameras and proceeds over the pinhole images', async () => {
    const pinholeCameraA = buildCamera({ cameraId: 1, width: 4, height: 3 });
    const pinholeCameraB = buildCamera({ cameraId: 2, width: 4, height: 3 });
    const sphericalCamera = buildCamera({
      cameraId: 3,
      modelId: CameraModelId.EQUIRECTANGULAR,
      width: 3840,
      height: 1920,
      params: [3840, 1920],
    });
    const pinholeA = buildImage({ imageId: 10, cameraId: 1, name: 'p1.jpg' });
    const pinholeB = buildImage({ imageId: 11, cameraId: 2, name: 'p2.jpg' });
    const spherical1 = buildImage({ imageId: 20, cameraId: 3, name: 's1.jpg' });
    const spherical2 = buildImage({ imageId: 21, cameraId: 3, name: 's2.jpg' });
    const spherical3 = buildImage({ imageId: 22, cameraId: 3, name: 's3.jpg' });
    const reconstruction = buildReconstruction({
      cameras: [pinholeCameraA, pinholeCameraB, sphericalCamera],
      images: [pinholeA, pinholeB, spherical1, spherical2, spherical3],
    });
    const pinholeFiles = new Map([
      [pinholeA.name, buildFile(pinholeA.name)],
      [pinholeB.name, buildFile(pinholeB.name)],
    ]);
    const session = {
      computeImageMetric: vi.fn().mockResolvedValue({ psnr: 30, mse: 10, validPixelCount: 12 }),
      dispose: vi.fn(),
    };
    createWebGpuSplatPsnrSessionMock.mockResolvedValue(session);

    const { facade, actions } = createFacade({
      reconstruction,
      dataset: {
        getImageSync: vi.fn((name: string) => pinholeFiles.get(name)),
        getImage: vi.fn(async (name: string) => pinholeFiles.get(name) ?? null),
        getMetricImage: vi.fn(async (name: string) => pinholeFiles.get(name) ?? null),
        hasMasks: vi.fn(() => false),
        getMask: vi.fn(async () => null),
        getMaskSync: vi.fn(() => undefined),
      } as unknown as SplatPsnrEvaluatorStoreFacade['data']['dataset'],
      splatPsnrComputeRequest: { id: 1, scope: 'all' },
    });
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    render(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(actions.finishSplatPsnrCompute).toHaveBeenCalledTimes(1);
    });

    // The compute proceeds over the two pinhole images only.
    expect(actions.setSplatPsnrPending).toHaveBeenCalledWith([pinholeA.imageId, pinholeB.imageId]);
    expect(actions.setSplatPsnrPending).not.toHaveBeenCalledWith(
      expect.arrayContaining([spherical1.imageId])
    );

    // Exactly one info notification, naming the count and unsupported-camera reason.
    const notifications = actions.addNotification.mock.calls;
    expect(notifications).toHaveLength(1);
    expect(notifications[0][0]).toBe('info');
    expect(notifications[0][1]).toContain('unsupported');
    expect(notifications[0][1]).toContain('3');
  });

  it('warns and starts no compute when the selected camera is unsupported', async () => {
    const sphericalCamera = buildCamera({
      cameraId: 1,
      modelId: CameraModelId.EQUIRECTANGULAR,
      width: 3840,
      height: 1920,
      params: [3840, 1920],
    });
    const sphericalImage = buildImage({ imageId: 30, cameraId: 1, name: 'equirect.jpg' });
    const reconstruction = buildReconstruction({
      cameras: [sphericalCamera],
      images: [sphericalImage],
    });
    const { facade, actions } = createFacade({
      reconstruction,
      splatPsnrComputeRequest: { id: 1, scope: 'selected', selectedImageId: sphericalImage.imageId },
    });
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    render(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(actions.addNotification).toHaveBeenCalledTimes(1);
    });
    expect(actions.addNotification).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('camera model')
    );

    // No pointless compute is started for an unsupported selection.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(createWebGpuSplatPsnrSessionMock).not.toHaveBeenCalled();
    expect(actions.setSplatPsnrPending).not.toHaveBeenCalled();
  });

  it('does not notify for an all-pinhole compute-all', async () => {
    const camera = buildCamera({ cameraId: 1, width: 4, height: 3 });
    const image = buildImage({ imageId: 40, cameraId: 1, name: 'pin.jpg' });
    const imageFile = buildFile(image.name);
    const session = {
      computeImageMetric: vi.fn().mockResolvedValue({ psnr: 30, mse: 10, validPixelCount: 12 }),
      dispose: vi.fn(),
    };
    createWebGpuSplatPsnrSessionMock.mockResolvedValue(session);

    const { facade, actions } = createFacade({
      reconstruction: buildReconstruction({ cameras: [camera], images: [image] }),
      dataset: {
        getImageSync: vi.fn(() => imageFile),
        getImage: vi.fn(async () => imageFile),
        getMetricImage: vi.fn(async () => imageFile),
        hasMasks: vi.fn(() => false),
        getMask: vi.fn(async () => null),
        getMaskSync: vi.fn(() => undefined),
      } as unknown as SplatPsnrEvaluatorStoreFacade['data']['dataset'],
      splatPsnrComputeRequest: { id: 1, scope: 'all' },
    });
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    render(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(actions.finishSplatPsnrCompute).toHaveBeenCalledTimes(1);
    });

    expect(actions.addNotification).not.toHaveBeenCalled();
  });
});
