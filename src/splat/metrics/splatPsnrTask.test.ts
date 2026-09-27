import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatasetManager } from '../../dataset';
import {
  buildCamera, buildDatasetState, buildFile, buildImage, buildLoadedFiles, buildReconstruction,
} from '../../test/builders';
import { createIdentityEuler } from '../../utils/sim3dTransforms';
import type { PsnrResult } from './psnrTypes';
import {
  cancelSplatPsnrTask,
  runSplatPsnrTask,
  type SplatPsnrRenderSession,
  type SplatPsnrTaskControl,
  type SplatPsnrTaskSnapshot,
} from './splatPsnrTask';

const metric: PsnrResult = { psnr: 32, mse: 0.00063, validPixelCount: 12 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function createTask(session: SplatPsnrRenderSession, imageCount = 3) {
  const camera = buildCamera({ width: 4, height: 3 });
  const images = Array.from({ length: imageCount }, (_, index) => buildImage({
    imageId: index + 1, name: `image-${index + 1}.jpg`, cameraId: camera.cameraId,
  }));
  const reconstruction = buildReconstruction({ cameras: [camera], images });
  const splatFile = buildFile('scene.spz');
  const datasetState = buildDatasetState({
    sourceType: 'local',
    loadedFiles: buildLoadedFiles({ imageFiles: images.map((image) => buildFile(image.name)) }),
  });
  const actions = {
    setSplatPsnrPending: vi.fn(),
    setSplatPsnrComputingImage: vi.fn(),
    setSplatPsnrMetric: vi.fn(),
    setSplatPsnrMetrics: vi.fn(),
    setSplatPsnrImageError: vi.fn(),
    finishSplatPsnrCompute: vi.fn(),
  };
  const snapshot: SplatPsnrTaskSnapshot = {
    imageIds: images.map((image) => image.imageId),
    onImageReady: vi.fn(),
    reconstruction,
    dataset: new DatasetManager(() => datasetState),
    splatFile,
    request: { id: 1, scope: 'all' },
    transform: createIdentityEuler(),
    splatTransform: createIdentityEuler(),
    actions,
    getRenderSession: vi.fn(async () => session),
    releaseRenderSession: vi.fn(),
  };
  const task: SplatPsnrTaskControl = {
    requestId: 1,
    dataIdentity: { reconstruction, dataset: datasetState, splatFile },
    cancelled: false,
    mediaController: new AbortController(),
    renderSession: null,
    metricImagesIncompatible: false,
  };
  return { task, snapshot, actions, finish: vi.fn() };
}

describe('PSNR task lifecycle without React or a GPU', () => {
  afterEach(() => vi.useRealTimers());

  it('releases a renderer that finishes initializing after cancellation', async () => {
    const session = { computeImageMetric: vi.fn(), dispose: vi.fn() };
    const { task, snapshot, actions, finish } = createTask(session);
    const pendingSession = deferred<SplatPsnrRenderSession>();
    snapshot.getRenderSession = () => pendingSession.promise;

    const running = runSplatPsnrTask(task, snapshot, finish);
    cancelSplatPsnrTask(task, actions, true, snapshot.releaseRenderSession);
    pendingSession.resolve(session);
    await running;

    expect(task.mediaController.signal.aborted).toBe(true);
    expect(snapshot.releaseRenderSession).toHaveBeenCalledExactlyOnceWith(session);
    expect(session.computeImageMetric).not.toHaveBeenCalled();
    expect(actions.setSplatPsnrImageError).not.toHaveBeenCalled();
    expect(actions.finishSplatPsnrCompute).toHaveBeenCalledOnce();
    expect(finish).toHaveBeenCalledExactlyOnceWith(task);
  });

  it('disposes pending GPU submissions without publishing their late results after cancellation', async () => {
    const submissions = [deferred<PsnrResult>(), deferred<PsnrResult>()];
    const disposals = [vi.fn(), vi.fn()];
    const bothSubmitted = deferred<void>();
    let nextSubmission = 0;
    const session = {
      computeImageMetric: vi.fn(),
      submitImageMetric: vi.fn(async () => {
        const index = nextSubmission++;
        if (nextSubmission === 2) bothSubmitted.resolve();
        return { result: submissions[index].promise, dispose: disposals[index] };
      }),
      dispose: vi.fn(),
    };
    const { task, snapshot, actions, finish } = createTask(session);
    const running = runSplatPsnrTask(task, snapshot, finish);
    await bothSubmitted.promise;

    cancelSplatPsnrTask(task, actions, true, snapshot.releaseRenderSession);
    submissions.forEach((submission) => submission.resolve(metric));
    await running;

    expect(session.submitImageMetric).toHaveBeenCalledTimes(2);
    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    expect(snapshot.releaseRenderSession).toHaveBeenCalledExactlyOnceWith(session);
    expect(actions.setSplatPsnrMetric).not.toHaveBeenCalled();
    expect(actions.setSplatPsnrMetrics).not.toHaveBeenCalled();
    expect(actions.setSplatPsnrImageError).not.toHaveBeenCalled();
    expect(finish).toHaveBeenCalledExactlyOnceWith(task);
  });

  it('flushes a final partial metric batch and clears its timer when all images finish', async () => {
    vi.useFakeTimers();
    const disposeSubmission = vi.fn();
    const session = {
      computeImageMetric: vi.fn(),
      submitImageMetric: vi.fn(async () => ({
        result: Promise.resolve(metric), dispose: disposeSubmission,
      })),
      dispose: vi.fn(),
    };
    const { task, snapshot, actions, finish } = createTask(session);
    await runSplatPsnrTask(task, snapshot, finish);

    expect(actions.setSplatPsnrMetrics).toHaveBeenCalledOnce();
    const records = actions.setSplatPsnrMetrics.mock.calls[0][0];
    expect(records).toEqual([1, 2, 3].map((imageId) => expect.objectContaining({
      imageId, psnr: metric.psnr, width: 4, height: 3,
    })));
    expect(snapshot.onImageReady).toHaveBeenCalledTimes(3);
    expect(disposeSubmission).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
    expect(finish).toHaveBeenCalledExactlyOnceWith(task);
  });
});
