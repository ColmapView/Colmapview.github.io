import { useEffect, useState } from 'react';
import { formatBytes, formatPreviewAge, formatPreviewCounts, phaseLabel } from './trainingUiPolicy';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import type { TrainingWindowState } from './useTrainingStoreFacade';
import { supportsTrainingGeometryPreview } from '../../training/trainingPreviewFormat';

export function TrainingActivity({ state }: { state: TrainingWindowState }) {
  const { currentJob, phase, upload, config, previewEnabled, setPreviewEnabled, previewUpdatedAt,
    previewCapturedAt, previewShownSplats, previewTotalSplats, previewError } = state;
  const [now, setNow] = useState(() => Date.now());
  const terminal = ['succeeded', 'failed', 'cancelled'].includes(phase);
  useEffect(() => {
    if (previewUpdatedAt === null || terminal) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [previewUpdatedAt, terminal]);
  const preparing = ['preparing', 'uploading', 'validating'].includes(phase);
  const progress = terminal || preparing ? null : currentJob?.progress;
  const exposure = progress?.image_exposures;
  const maximum = progress?.target_image_exposures;
  const previewCounts = formatPreviewCounts(previewShownSplats, previewTotalSplats);
  const capturedAt = previewCapturedAt ? new Date(previewCapturedAt) : null;
  const supportsPreview = supportsTrainingGeometryPreview(config?.backend.preview_formats);
  const showPreview = Boolean(currentJob && supportsPreview && !terminal);
  const hasPreviewDetails = !terminal && (showPreview || previewUpdatedAt !== null || Boolean(previewError));
  const percent = exposure != null && maximum != null && maximum > 0
    ? Math.min(100, Math.max(0, Math.round(exposure / maximum * 100))) : null;
  return <div className="training-window-stack">
    {(currentJob || upload || !['idle', 'disconnected'].includes(phase)) && <section className="training-window-section" aria-labelledby="training-progress-heading">
      <div className="training-window-row training-window-detail-row">
        <span>Status</span>
        <div className="training-window-section">
          <div className="flex items-center justify-between gap-2">
            <h2 id="training-progress-heading" className="panel-heading text-ds-primary text-sm font-semibold" aria-live="polite">{phaseLabel(phase)}</h2>
            {percent !== null && <span className="text-xs text-ds-muted">{percent}%</span>}
          </div>
          {preparing && upload && <p className="text-xs text-ds-muted" title={upload.currentFile ?? undefined}>{upload.completedFiles}/{upload.totalFiles} files · {formatBytes(upload.uploadedBytes)}</p>}
          {exposure != null && maximum != null &&
            <progress className="training-window-progress" value={exposure} max={maximum} aria-label="Image exposures" title={`${exposure.toLocaleString()} / ${maximum.toLocaleString()} image exposures`} />}
          {!terminal && currentJob?.queue_position != null && <p className="text-xs text-ds-muted">Waiting for the local trainer.</p>}
          {currentJob?.error && <p role="alert" className="text-ds-error">{currentJob.error.detail ?? currentJob.error.code}</p>}
        </div>
      </div>
    </section>}
    {hasPreviewDetails && <section className="training-window-section" aria-label="Preview and result">
      <div className="training-window-preview-row">
        {showPreview &&
          <ToggleSwitch label="Live preview" checked={previewEnabled} onChange={setPreviewEnabled} className="training-window-row" />}
        {previewUpdatedAt !== null && <p className="text-xs text-ds-muted" title={`${previewCounts ?? ''}${capturedAt && !Number.isNaN(capturedAt.getTime()) ? ` / Captured ${capturedAt.toLocaleTimeString()}` : ''}`}>
          {formatPreviewAge(previewUpdatedAt, now)}
        </p>}
      </div>
      {previewError && <div className="training-window-row">
        <p role="status" className="training-window-row-value text-ds-warning">{previewError}</p>
      </div>}
    </section>}
  </div>;
}
