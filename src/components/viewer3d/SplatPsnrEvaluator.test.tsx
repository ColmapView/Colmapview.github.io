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
import type { SplatPsnrEvaluatorStoreFacade } from './SplatPsnrEvaluatorStoreFacade';
import { SplatPsnrEvaluator } from './SplatPsnrEvaluator';

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
    gpuPsnr: true,
    status: 'available',
    reason: 'WebGPU PSNR is available',
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
  };
  const data: SplatPsnrEvaluatorStoreFacade['data'] = {
    reconstruction,
    dataset: {
      getImageSync: vi.fn(() => imageFile),
      getImage: vi.fn(async () => imageFile),
      getMetricImage: vi.fn(async () => imageFile),
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
  });

  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
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

  it('automatically requests all-image PSNR once the scene is metric-ready', async () => {
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
      } as unknown as SplatPsnrEvaluatorStoreFacade['data']['dataset'],
      splatPsnrComputeRequest: { id: 1, scope: 'selected', selectedImageId: image.imageId },
    });
    useSplatPsnrEvaluatorStoreFacadeMock.mockImplementation(() => facade);

    render(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(computeImageMetric).toHaveBeenCalledTimes(1);
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

  it('re-probes metric WebGPU after device loss and accepts a later request once ready', async () => {
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
      gpuPsnr: false,
      reason: 'WebGPU PSNR failed to initialize: adapter reset',
    };
    facade.data.splatPsnrFrameReady = false;
    view.rerender(<SplatPsnrEvaluator />);

    await waitFor(() => {
      expect(ensureSplatPsnrWebGpuDeviceMock).toHaveBeenCalledTimes(2);
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
});
