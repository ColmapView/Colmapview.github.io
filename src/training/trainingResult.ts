import { useReconstructionStore, useTransformStore } from '../store';
import { useTrainingStore } from '../store';
import type { SplatFileSource } from '../types/colmap';
import type { TrainingJob } from './types';
import { isSourceIdForCurrentReconstruction } from './trainingSnapshot';
import { trainingPreviewController } from './previewController';
import { TrainingClient } from './trainingClient';
import { observeTrainingMilestone } from './trainingTiming';

const loads = new Map<string, Promise<boolean>>();

function sourceIdFor(job: TrainingJob, serverUrl: string, artifactId = 'final'): string {
  return `training:${encodeURIComponent(serverUrl)}:${job.job_id}:${artifactId}`;
}

export function loadTrainingResult(job: TrainingJob, client: TrainingClient): Promise<boolean> {
  const artifact = job.artifacts?.find((item) => item.format === 'ply' && item.coordinate_space === 'colmap');
  if (!artifact) return Promise.resolve(false);
  const sourceId = sourceIdFor(job, client.baseUrl, artifact.artifact_id);
  const existing = loads.get(sourceId);
  if (existing) return existing;
  const association = useTrainingStore.getState().snapshotAssociations[job.client_snapshot_id];
  if (job.state !== 'succeeded' || !association
    || !isSourceIdForCurrentReconstruction(association.sourceId)) return Promise.resolve(false);
  const initialSelection = useReconstructionStore.getState().requestedSplatSourceId;
  const isCurrent = () => {
    const state = useTrainingStore.getState();
    const selected = useReconstructionStore.getState().requestedSplatSourceId;
    return state.snapshotAssociations[job.client_snapshot_id] === association && state.currentJobId === job.job_id
      && (selected === initialSelection || selected === sourceId)
      && state.serverUrl.replace(/\/$/, '') === client.baseUrl
      && isSourceIdForCurrentReconstruction(association.sourceId);
  };
  const finish = () => {
    // The completed artifact is rendered by the regular reconstruction splat
    // layer. Release the temporary preview GPU resource instead of decoding the
    // same PLY a second time in the preview renderer.
    trainingPreviewController.setTarget(null);
    useTrainingStore.setState({
      finalLoadedJobId: job.job_id,
      previewActive: false,
      previewError: null,
    });
    // Catalog attachment, not a claim that the regular renderer has drawn a frame.
    observeTrainingMilestone(job.job_id, 'final_result_attached');
  };
  if (useReconstructionStore.getState().loadedFiles?.splatFileSources?.some((source) => source.id === sourceId)) {
    return useReconstructionStore.getState().selectSplatSource(sourceId).then(() => {
      if (!isCurrent()) return false;
      finish();
      return true;
    });
  }
  const load = (async () => {
    const file = await client.artifact(job.job_id, artifact.artifact_id);
    if (!isCurrent()) return false;
    if (!attachTrainingResult(job, file, client.baseUrl, artifact.artifact_id)) return false;
    if (!isCurrent()) return false;
    finish();
    return true;
  })().finally(() => loads.delete(sourceId));
  loads.set(sourceId, load);
  return load;
}

/** Attach only a completed final artifact; live preview frames never enter this catalog. */
export function attachTrainingResult(job: TrainingJob, file: File, serverUrl = useTrainingStore.getState().serverUrl, artifactId = 'final'): boolean {
  const association = useTrainingStore.getState().snapshotAssociations[job.client_snapshot_id];
  if (job.state !== 'succeeded' || !association
    || !isSourceIdForCurrentReconstruction(association.sourceId)) return false;
  const current = useReconstructionStore.getState().loadedFiles;
  if (!current) return false;
  const sourceId = sourceIdFor(job, serverUrl, artifactId);
  // A retry/double click must not grow the saved source catalog. If it already
  // exists, the completed artifact is already attached to this reconstruction.
  if (current.splatFileSources?.some((candidate) => candidate.id === sourceId)) {
    void useReconstructionStore.getState().selectSplatSource(sourceId);
    return true;
  }
  const source: SplatFileSource = {
    id: sourceId,
    path: file.name,
    file,
    size: file.size,
    transformBaseline: { ...(association.splatTransformBaseline ?? useTransformStore.getState().splatTransform) },
    trainingResult: { serverUrl, jobId: job.job_id, artifactId, snapshotId: association.id },
  };
  // This is intentionally a catalog-only replacement, not a reconstruction load:
  // camera selection, masks, transforms and WASM data all remain in place.
  useReconstructionStore.setState({
    loadedFiles: {
      ...current,
      splatFile: file,
      splatFiles: [...(current.splatFiles ?? []), file],
      splatFileSources: [...(current.splatFileSources ?? []), source],
    },
  });
  void useReconstructionStore.getState().selectSplatSource(sourceId);
  return true;
}
