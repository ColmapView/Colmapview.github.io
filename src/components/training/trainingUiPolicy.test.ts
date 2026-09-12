import { describe, expect, it } from 'vitest';
import type { TrainingJob } from '../../training';
import {
  formatPreviewAge,
  formatPreviewCounts,
  formatTrainingStatus,
  isForeignTrainingJob,
} from './trainingUiPolicy';

const job = {
  client_label: 'browser-a', state: 'running', queue_position: null,
  progress: { image_exposures: 400, target_image_exposures: 1000, metrics: {} },
} as TrainingJob;

describe('training UI policy', () => {
  it('formats bounded preview and job status without inventing rates', () => {
    expect(formatPreviewAge(null, 1000)).toBe('No preview received');
    expect(formatPreviewAge(500, 1000)).toBe('Updated just now');
    expect(formatPreviewAge(1000, 4500)).toBe('Updated 3.5s ago');
    expect(formatPreviewCounts(100_000, 240_000)).toBe('100,000 / 240,000 splats shown');
    expect(formatPreviewCounts(949_123, 949_123)).toBe('949,123 splats shown (all)');
    expect(formatTrainingStatus(job, 'running')).toBe('Training 40%');
    expect(formatTrainingStatus(null, 'idle')).toBeNull();
  });

  it('prioritizes terminal, disconnected, queued, and cancelling truth over stale progress', () => {
    expect(formatTrainingStatus({ ...job, state: 'failed' }, 'failed')).toBe('Training · Failed');
    expect(formatTrainingStatus({ ...job, state: 'succeeded' }, 'succeeded')).toBe('Training · Succeeded');
    expect(formatTrainingStatus(job, 'disconnected')).toBe('Training · Disconnected');
    expect(formatTrainingStatus({ ...job, state: 'queued', queue_position: 3 }, 'queued')).toBe('Training · waiting #3');
    expect(formatTrainingStatus(job, 'cancelling')).toBe('Training · Cancelling');
  });

  it('derives display-only submission ownership independently of selection', () => {
    expect(isForeignTrainingJob(job, 'browser-a')).toBe(false);
    expect(isForeignTrainingJob(job, 'browser-b')).toBe(true);
  });
});
