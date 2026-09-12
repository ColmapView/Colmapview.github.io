import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore, useSplatBackendStore, useTrainingStore } from '../store';
import {
  setTrainingPreviewError,
  useTrainingPreviewVisible,
  useTrainingSparkBackendFacade,
} from './useTrainingPreviewStoreFacade';

describe('training preview store facade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useSplatBackendStore.setState(useSplatBackendStore.getInitialState(), true);
    useTrainingStore.setState(useTrainingStore.getInitialState(), true);
  });

  it('exposes the Spark preload policy state and actions', () => {
    const { result } = renderHook(useTrainingSparkBackendFacade);

    expect(result.current.requestedBackend).toBe('auto');
    expect(result.current.availability.spark).toBe(false);

    act(() => result.current.setSparkBackendAvailable(true));
    expect(result.current.availability.spark).toBe(true);

    act(() => result.current.setSparkPreloadFailed());
    expect(result.current.availability.sparkPreloadFailed).toBe(true);
  });

  it('routes renderer errors to the training session state', () => {
    act(() => setTrainingPreviewError('decode failed'));
    expect(useTrainingStore.getState().previewError).toBe('decode failed');
  });

  it('shows only the active selected final preview', () => {
    const final = new File(['ply'], 'final.ply');
    useTrainingStore.setState({
      previewActive: true,
      previewEnabled: true,
      finalLoadedJobId: 'job-1',
    });
    useReconstructionStore.setState({
      loadedFiles: {
        splatFile: final,
        splatFiles: [final],
        splatFileSources: [{
          file: final,
          trainingResult: { jobId: 'job-1' },
        }],
      },
    });

    const { result } = renderHook(useTrainingPreviewVisible);
    expect(result.current).toBe(true);

    act(() => useTrainingStore.setState({ finalLoadedJobId: 'job-2' }));
    expect(result.current).toBe(false);
  });
});
