import { beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore, useTrainingStore, useTransformStore } from '../store';
import { buildFile, buildReconstruction } from '../test/builders';
import { attachTrainingResult } from './trainingResult';
import { createTrainingSnapshot } from './trainingSnapshot';
import type { TrainingJob } from './types';
import { getSplatSourceTransform } from '../utils/splatSourceTransform';
import { composeSim3d, createIdentityEuler, createSim3dFromEuler, transformPoint } from '../utils/sim3dTransforms';

const job: TrainingJob = {
  job_id: 'job-1', dataset_id: 'dataset-1', client_snapshot_id: 'snapshot-1', source_label: 'Scene', client_label: '',
  backend_id: 'fixture', backend_version: '1', recipe_id: 'recipe', recipe_summary: {}, state: 'succeeded', phase: null,
  created_at: '2026-09-05T12:00:00Z', started_at: null, finished_at: null, enqueue_sequence: 1,
  queue_position: null, jobs_ahead: null, progress: null, error: null, artifacts: [],
};

describe('attachTrainingResult', () => {
  beforeEach(() => {
    useTrainingStore.getState().resetAttempt();
    useReconstructionStore.setState({ reconstruction: null, loadedFiles: null, wasmReconstruction: null, sourceType: null });
  });

  it('adds a final source exactly once without replacing the reconstruction', async () => {
    const reconstruction = buildReconstruction();
    useReconstructionStore.setState({ reconstruction, sourceType: 'local', loadedFiles: { imageFiles: new Map(), hasMasks: false } });
    const snapshot = await createTrainingSnapshot({ maskSource: 'none' });
    useTrainingStore.getState().setSnapshot(snapshot);
    const result = buildFile('final.ply', 'ply', 'application/octet-stream');

    const matchingJob = { ...job, client_snapshot_id: snapshot.id };
    expect(attachTrainingResult(matchingJob, result)).toBe(true);
    expect(attachTrainingResult(matchingJob, result)).toBe(true);
    const state = useReconstructionStore.getState();
    expect(state.reconstruction).toBe(reconstruction);
    expect(state.loadedFiles?.splatFileSources).toHaveLength(1);
    expect(state.loadedFiles?.splatFile).toBe(result);
  });

  it('rejects a succeeded job for a different snapshot and all nonterminal jobs', async () => {
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), loadedFiles: { imageFiles: new Map(), hasMasks: false } });
    const snapshot = await createTrainingSnapshot({ maskSource: 'none' });
    useTrainingStore.getState().setSnapshot(snapshot);
    const file = buildFile('final.ply', 'ply');
    expect(attachTrainingResult(job, file)).toBe(false);
    expect(attachTrainingResult({ ...job, state: 'running', client_snapshot_id: snapshot.id }, file)).toBe(false);
    expect(useReconstructionStore.getState().loadedFiles?.splatFileSources).toBeUndefined();
  });

  it('retains lightweight result identity for earlier runs without retaining their file readers', async () => {
    useReconstructionStore.setState({
      reconstruction: buildReconstruction(),
      sourceType: 'local',
      loadedFiles: { imageFiles: new Map(), hasMasks: false },
    });
    const first = await createTrainingSnapshot({ maskSource: 'none' });
    useTrainingStore.getState().setSnapshot(first);
    const second = await createTrainingSnapshot({ maskSource: 'none' });
    useTrainingStore.getState().setSnapshot(second);
    useTrainingStore.getState().resetAttempt();

    const state = useTrainingStore.getState();
    expect(state.snapshot).toBeNull();
    expect(state.snapshotAssociations[first.id]).toEqual(expect.objectContaining({
      id: first.id,
      sourceId: first.sourceId,
    }));
    expect(state.snapshotAssociations[first.id]).not.toHaveProperty('files');
    expect(attachTrainingResult({ ...job, client_snapshot_id: first.id }, buildFile('first-final.ply', 'ply'))).toBe(true);
  });

  it('VIEW-03: preserves a baked transform baseline through original/final reselection', async () => {
    const original = buildFile('original.ply', 'ply');
    const final = buildFile('final.ply', 'ply');
    const baked = { ...createIdentityEuler(), scale: 2.5, rotationX: 0.4, rotationY: -0.3, translationX: 4, translationY: -2, translationZ: 3 };
    const display = { ...createIdentityEuler(), scale: 0.7, rotationZ: -0.6, translationX: -1, translationY: 7 };
    useTransformStore.setState({ splatTransform: baked, transform: display });
    const reconstruction = buildReconstruction();
    const masks = new Map<string, File>();
    useReconstructionStore.setState({ reconstruction, loadedFiles: { imageFiles: masks, hasMasks: true,
      splatFile: original, splatFiles: [original], splatFileSources: [{ id: 'original', path: original.name, file: original }] } });
    const snapshot = await createTrainingSnapshot({ maskSource: 'none' });
    useTrainingStore.getState().setSnapshot(snapshot);
    expect(attachTrainingResult({ ...job, client_snapshot_id: snapshot.id }, final)).toBe(true);
    const finalSource = useReconstructionStore.getState().loadedFiles!.splatFileSources![1];
    expect(finalSource.transformBaseline).toEqual(baked);
    expect(finalSource.trainingResult?.snapshotId).toBe(snapshot.id);
    const rawPoint: [number, number, number] = [1, -2, 0.5];
    const bakedPoint = transformPoint(createSim3dFromEuler(baked), rawPoint);
    const expected = transformPoint(createSim3dFromEuler(display), bakedPoint);
    for (const sourceId of ['original', finalSource.id, 'original', finalSource.id]) {
      await useReconstructionStore.getState().selectSplatSource(sourceId);
      const files = useReconstructionStore.getState().loadedFiles!;
      const relative = getSplatSourceTransform(useTransformStore.getState().splatTransform, files);
      const mapped = transformPoint(composeSim3d(createSim3dFromEuler(display), createSim3dFromEuler(relative)), sourceId === 'original' ? rawPoint : bakedPoint);
      mapped.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 10));
    }
    expect(useReconstructionStore.getState().loadedFiles?.splatFileSources).toHaveLength(2);
    expect(useReconstructionStore.getState().loadedFiles?.imageFiles).toBe(masks);
    expect(useReconstructionStore.getState().reconstruction).toBe(reconstruction);
    expect(useTransformStore.getState().splatTransform).toBe(baked);
    expect(useTransformStore.getState().transform).toBe(display);
  });
});
