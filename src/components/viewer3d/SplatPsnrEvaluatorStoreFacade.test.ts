import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useImageMetricsStore,
  useReconstructionStore,
  useSplatBackendStore,
  useTransformStore,
} from '../../store';
import {
  buildFile,
  buildLoadedFiles,
  buildReconstruction,
} from '../../test/builders';
import { useSplatPsnrEvaluatorStoreFacade } from './SplatPsnrEvaluatorStoreFacade';

describe('useSplatPsnrEvaluatorStoreFacade', () => {
  beforeEach(() => {
    useImageMetricsStore.setState(useImageMetricsStore.getInitialState(), true);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useSplatBackendStore.setState(useSplatBackendStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
  });

  it('collects evaluator inputs from reconstruction, transform, and metric stores', () => {
    const reconstruction = buildReconstruction();
    const imageFile = buildFile('image.jpg');
    const splatFile = buildFile('scene.ply', 'splat');

    useReconstructionStore.setState({
      reconstruction,
      sourceType: 'local',
      loadedFiles: buildLoadedFiles({ imageFiles: [imageFile], splatFile }),
    });
    useTransformStore.getState().setTransform({ scale: 2 });
    useImageMetricsStore.setState({
      splatPsnrFrameReady: true,
      splatPsnrComputeRequest: { id: 3, scope: 'selected', selectedImageId: 1 },
    });
    useSplatBackendStore.getState().setWebGpuBackendState('ready');
    useSplatBackendStore.getState().setWebGpuMetricState('ready');

    const { result } = renderHook(() => useSplatPsnrEvaluatorStoreFacade());

    expect(result.current.data).toMatchObject({
      reconstruction,
      splatFile,
      splatPsnrFrameReady: true,
      splatPsnrComputeRequest: { id: 3, scope: 'selected', selectedImageId: 1 },
      splatBackendResolution: expect.objectContaining({ backend: 'webgpu', gpuPsnr: true }),
      splatMetricCapability: expect.objectContaining({ status: 'available', gpuPsnr: true }),
      transform: expect.objectContaining({ scale: 2 }),
    });
    expect(result.current.data.dataset.getImageSync('image.jpg')).toBe(imageFile);
  });

  it('routes evaluator progress actions to the image metrics store', () => {
    const { result } = renderHook(() => useSplatPsnrEvaluatorStoreFacade());

    act(() => {
      result.current.actions.setWebGpuMetricState('failed', 'adapter unavailable');
      result.current.actions.setSplatPsnrPending([4]);
      result.current.actions.setSplatPsnrFrameReady(true);
      result.current.actions.setSplatPsnrComputingImage(4);
      result.current.actions.setSplatPsnrMetric({
        imageId: 4,
        psnr: 28,
        mse: 103,
        validPixelCount: 2048,
        width: 128,
        height: 96,
        computedAt: 555,
      });
      result.current.actions.setSplatPsnrImageError(5, 'missing image');
      result.current.actions.finishSplatPsnrCompute();
    });

    const state = useImageMetricsStore.getState();
    expect(useSplatBackendStore.getState().metricCapability.reason)
      .toBe('WebGPU PSNR failed to initialize: adapter unavailable');
    expect(state.splatPsnrFrameReady).toBe(true);
    expect(state.splatPsnrMetrics.get(4)?.psnr).toBe(28);
    expect(state.splatPsnrStatus.get(4)).toBe('ready');
    expect(state.splatPsnrStatus.get(5)).toBe('error');
    expect(state.splatPsnrError.get(5)).toBe('missing image');
    expect(state.splatPsnrComputing).toBe(false);
  });
});
