import type { TrainingJob, TrainingSessionPhase } from '../../training';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function phaseLabel(phase: string): string {
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

export function isForeignTrainingJob(job: TrainingJob | null | undefined, clientLabel: string): boolean {
  return Boolean(job && job.client_label !== clientLabel);
}

export function confirmTrainingCancellation(job: TrainingJob | null | undefined, clientLabel: string): boolean {
  return !isForeignTrainingJob(job, clientLabel) || window.confirm('Cancel this job submitted by another frontend?');
}

export function formatPreviewAge(updatedAt: number | null, now: number): string {
  if (updatedAt === null) return 'No preview received';
  const seconds = Math.max(0, (now - updatedAt) / 1000);
  if (seconds < 1) return 'Updated just now';
  if (seconds < 60) return `Updated ${seconds.toFixed(seconds < 10 ? 1 : 0)}s ago`;
  return `Updated ${Math.floor(seconds / 60)}m ago`;
}

export function formatPreviewCounts(shown: number | null, total: number | null): string | null {
  if (shown === null && total === null) return null;
  if (shown !== null && shown === total) return `${shown.toLocaleString()} splats shown (all)`;
  if (shown !== null && total !== null) return `${shown.toLocaleString()} / ${total.toLocaleString()} splats shown`;
  if (shown !== null) return `${shown.toLocaleString()} splats shown`;
  return `${total!.toLocaleString()} total splats`;
}

export function formatTrainingStatus(job: TrainingJob | null, phase: TrainingSessionPhase): string | null {
  if (!job && ['idle', 'disconnected'].includes(phase)) return null;
  const state = job?.state ?? phase;
  const label = (value: string) => `Training · ${value.charAt(0).toUpperCase()}${value.slice(1)}`;
  if (phase === 'disconnected') return label(phase);
  if (['succeeded', 'failed', 'cancelled'].includes(state)) return label(state);
  if (['preparing', 'uploading', 'validating', 'cancelling'].includes(phase)) return label(phase);
  if (job?.queue_position != null || state === 'queued') {
    return job?.queue_position != null ? `Training · waiting #${job.queue_position}` : label(state);
  }
  const progress = job?.progress;
  if (['starting', 'running', 'training', 'finalizing'].includes(state)
    && progress?.image_exposures != null && progress.target_image_exposures) {
    const percent = Math.max(0, Math.min(100, Math.round(
      100 * progress.image_exposures / progress.target_image_exposures,
    )));
    return `Training ${percent}%`;
  }
  return label(state);
}
