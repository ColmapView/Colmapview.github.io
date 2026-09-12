import { describe, expect, it, vi } from 'vitest';
import { TrainingTiming, beginTrainingTiming, inspectTrainingTimings, observeTrainingMilestone, observeTrainingProgress } from './trainingTiming';

describe('training timing ownership', () => {
  it('keeps committed preview/result milestones with their owning job and records each once', () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(10);
    try {
      const first = beginTrainingTiming('milestone-first');
      first.jobId = 'milestone-job-first';
      const second = beginTrainingTiming('milestone-second');
      second.jobId = 'milestone-job-second';
      clock.mockReturnValue(25);
      observeTrainingMilestone(first.jobId, 'first_preview_displayed');
      clock.mockReturnValue(40);
      observeTrainingMilestone(first.jobId, 'first_preview_displayed');
      observeTrainingMilestone(first.jobId, 'final_result_attached');
      observeTrainingMilestone('unknown-job', 'final_result_attached');
      expect(first.snapshot().marksMs).toMatchObject({ first_preview_displayed: 15, final_result_attached: 30 });
      expect(second.snapshot().marksMs.first_preview_displayed).toBeUndefined();
      expect(second.snapshot().marksMs.final_result_attached).toBeUndefined();
    } finally { clock.mockRestore(); }
  });

  it('settles failed spans and returns independent snapshots', async () => {
    const trace = new TrainingTiming('attempt');
    await expect(trace.measure('upload', async () => { throw new Error('failed'); })).rejects.toThrow('failed');
    const snapshot = trace.snapshot();
    expect(snapshot.stages.upload).toMatchObject({ count: 1, active: 0, failed: 1, peakActive: 1 });
    snapshot.stages.upload.failed = 100;
    expect(trace.snapshot().stages.upload.failed).toBe(1);
  });

  it('keeps late completion with its original attempt and bounds retained history', async () => {
    const first = beginTrainingTiming('first');
    first.jobId = 'job-first';
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const pending = first.measure('upload', () => gate);
    const second = beginTrainingTiming('second');
    second.jobId = 'job-second';
    release();
    await pending;
    observeTrainingProgress('job-first', 1);
    expect(first.snapshot().marksMs.first_training_progress_observed).toBeDefined();
    expect(second.snapshot().marksMs.first_training_progress_observed).toBeUndefined();
    expect(second.snapshot().stages.upload).toBeUndefined();
    for (let index = 0; index < 8; index++) beginTrainingTiming(`later-${index}`);
    expect(inspectTrainingTimings()).toHaveLength(4);
  });

  it('records the first observation, not each polling update', () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(10);
    try {
      const trace = beginTrainingTiming('observed');
      trace.jobId = 'observed-job';
      observeTrainingProgress('observed-job', 0);
      clock.mockReturnValue(30);
      observeTrainingProgress('observed-job', 1);
      clock.mockReturnValue(50);
      observeTrainingProgress('observed-job', 2);
      expect(trace.snapshot().marksMs.first_training_progress_observed).toBe(20);
    } finally { clock.mockRestore(); }
  });
});
