import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReconstructionStore, useTrainingStore } from '../../store';
import { buildReconstruction } from '../../test/builders';
import { trainingConfigSchema, trainingJobSchema } from '../../training/trainingClient';
import wire from '../../training/fixtures/wire-v1.json';
import { TrainingToggleButton } from './TrainingToggleButton';
import { useViewerControlPanelState } from '../viewer3d/useViewerControlPanelState';

function TrainingPanelHarness() {
  return <TrainingToggleButton {...useViewerControlPanelState()} />;
}

const actions = vi.hoisted(() => ({
  connect: vi.fn(async () => undefined), disconnect: vi.fn(), start: vi.fn(async () => undefined), startFresh: vi.fn(async () => undefined),
  cancel: vi.fn(async () => undefined), cancelJob: vi.fn(async () => undefined),
  selectRun: vi.fn(async () => undefined), abandonAttempt: vi.fn(async () => undefined),
  adoptSelectedJob: vi.fn(async () => undefined),
}));
vi.mock('../../training', async importOriginal => ({
  ...await importOriginal<typeof import('../../training')>(), useTrainingSessionActions: () => actions,
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'innerWidth', { value: 1280, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: 900, writable: true });
  useTrainingStore.setState({ ...useTrainingStore.getInitialState(), dockOpen: true,
    connected: true, config: trainingConfigSchema.parse(wire.config) }, true);
  useReconstructionStore.setState({
    reconstruction: buildReconstruction(), wasmReconstruction: null, sourceType: 'local',
    loadedFiles: { imageFiles: new Map(), hasMasks: false },
  });

});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('TrainingPanelHarness presentation', () => {
  it('uses the shared hover panel without a dialog or window controls', () => {
    const { container } = render(<TrainingPanelHarness />);
    const panel = screen.getByRole('region', { name: 'Training' });
    expect(container).toContainElement(panel);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: /Close training|Resize training/ })).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    fireEvent.mouseLeave(screen.getByRole('button', { name: 'Training' }).parentElement!);
    expect(screen.queryByRole('region', { name: 'Training' })).toBeNull();
    expect(actions.cancel).not.toHaveBeenCalled();
  });

  it('uses the single action to connect before allowing training', async () => {
    useTrainingStore.setState({ connected: false, config: null });
    render(<TrainingPanelHarness />);
    const connect = screen.getByRole('button', { name: /^Start$/ });
    expect(document.querySelectorAll('.training-window-body button, .training-window-action button')).toHaveLength(1);
    fireEvent.click(connect);
    await waitFor(() => expect(actions.startFresh).toHaveBeenCalledOnce());
    expect(actions.start).not.toHaveBeenCalled();
  });

  it('keeps server fields visible after connecting and avoids an empty preview section on failure', () => {
    useTrainingStore.setState({ connected: false });
    render(<TrainingPanelHarness />);
    expect(screen.getByLabelText('Server URL')).toBeVisible();
    const failed = trainingJobSchema.parse({ ...wire.job, state: 'failed' });
    act(() => useTrainingStore.setState({ connected: true, currentJob: failed, phase: 'failed' }));
    expect(screen.getByLabelText('Server URL')).toBeVisible();
    expect(document.querySelectorAll('.training-panel details, .training-panel summary')).toHaveLength(0);
    expect(screen.queryByRole('region', { name: 'Preview and result' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Start' }).closest('.training-window-body')).toBeNull();
  });

  it('hides stale progress and preview timestamps after a run fails', () => {
    const failed = trainingJobSchema.parse({ ...wire.job, state: 'failed',
      progress: { image_exposures: 100, target_image_exposures: 1000, optimizer_step: 25, metrics: {} } });
    useTrainingStore.setState({ currentJob: failed, phase: 'failed', previewUpdatedAt: Date.now() });
    render(<TrainingPanelHarness />);
    expect(screen.getByRole('heading', { name: 'Failed' })).toBeVisible();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Preview and result' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled();
  });

  it('opens from keyboard and returns focus to the toolbar on Escape', () => {
    useTrainingStore.setState({ dockOpen: false });
    render(<TrainingPanelHarness />);
    const trigger = screen.getByRole('button', { name: 'Training' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const input = screen.getByLabelText('Server URL');
    act(() => input.focus());
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Training' })).toBeNull();
    expect(trigger).toHaveFocus();
    expect(actions.cancel).not.toHaveBeenCalled();
  });

  it('keeps backend logs out of the panel', () => {
    useTrainingStore.setState({ logs: 'Backend worker output', logsTruncated: true });
    render(<TrainingPanelHarness />);
    expect(screen.queryByRole('region', { name: 'Training logs' })).toBeNull();
    expect(screen.queryByText('Backend worker output')).toBeNull();
    expect(screen.queryByText('Earlier log output was truncated.')).toBeNull();
    expect(screen.getByRole('button', { name: /^Start$/ })).toBeVisible();
  });

  it('starts training on the single page and closing leaves the session running', async () => {
    render(<TrainingPanelHarness />);
    fireEvent.click(screen.getByRole('button', { name: /^Start$/ }));
    await waitFor(() => expect(actions.startFresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('tab')).toBeNull();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Start' }), { key: 'Escape' });
    expect(actions.cancel).not.toHaveBeenCalled();
    expect(actions.disconnect).not.toHaveBeenCalled();
  });

  it('omits mask details when no masks will be used', () => {
    const base = trainingConfigSchema.parse(wire.config);
    useTrainingStore.setState({ config: {
      ...base,
      editable_settings: { schema_version: 1, fields: [
        { key: 'use_masks', label: 'Use masks', description: '', group: 'Masks',
          value_type: 'boolean', default: true },
      ] },
    } });

    render(<TrainingPanelHarness />);

    expect(screen.queryByText(/^Masks:/)).toBeNull();
  });

  it('shows only the current run instead of global queue and history panels', () => {
    const job = trainingJobSchema.parse({ ...wire.job, client_label: 'other-frontend' });
    useTrainingStore.setState({
      currentJob: job,
      currentJobId: job.job_id,
      phase: job.state,
      queue: { revision: 1, capacity: 5, active_job: null, waiting: [job], blocked_reason: null },
      recentRuns: [job],
    });
    render(<TrainingPanelHarness />);
    expect(screen.queryByRole('heading', { name: 'Queue' })).toBeNull();
    expect(screen.queryByText('Recent runs')).toBeNull();
    expect(screen.getByText('Waiting for the local trainer.')).toBeVisible();
  });

});

describe('TrainingPanelHarness server-described setup', () => {
  beforeEach(() => {
    useTrainingStore.setState({ authenticationMode: 'local', config: {
      ...trainingConfigSchema.parse(wire.config),
      editable_settings: { schema_version: 1, fields: [
        { key: 'budget', label: 'Image budget', description: 'Number of image exposures.', group: 'Training', value_type: 'integer', default: 100, minimum: 1, maximum: 1000 },
        { key: 'masks', label: 'Use masks', description: 'Use supervision masks.', group: 'Masks', value_type: 'boolean', default: true },
        { key: 'mode', label: 'Mask mode', description: 'How to use masks.', group: 'Masks', value_type: 'enum', default: 'include',
          choices: [{ value: 'include', label: 'Include' }, { value: 'exclude', label: 'Exclude' }], enabled_when: [{ key: 'masks', equals: true }] },
        { key: 'limit', label: 'Splat limit', description: 'Maximum number of splats.', group: 'Resources', value_type: 'integer', default: null, minimum: 0,
          nullable: true, null_label: 'Automatic', zero_label: 'Unlimited', advanced: true },
      ] },
    } });
  });

  it('uses local auth discovery and exposes tokens only when required', () => {
    render(<TrainingPanelHarness />);
    expect(screen.queryByLabelText('Session token')).toBeNull();
    expect(screen.getByLabelText('Server URL')).toBeVisible();
    act(() => useTrainingStore.setState({ authenticationMode: 'bearer', tokenRequired: true }));
    expect(screen.getByLabelText('Session token')).toHaveAttribute('type', 'password');
  });

  it('does not expose training configuration or let stale validation block Start', () => {
    useTrainingStore.setState({ settingsDraft: { batch_size: 8 }, settingsErrors: { batch_size: 'Old error' } });
    render(<TrainingPanelHarness />);
    expect(screen.queryByLabelText('Image budget')).toBeNull();
    expect(screen.queryByText('Advanced settings')).toBeNull();
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled();
  });

  it.each(['running', 'succeeded', 'failed', 'cancelled'] as const)('always starts fresh from %s with backend settings', async phase => {
    const currentJob = trainingJobSchema.parse({ ...wire.job, state: phase });
    useTrainingStore.setState({ currentJob, currentJobId: currentJob.job_id, phase, legacyAttempt: true });
    render(<TrainingPanelHarness />);
    expect(screen.queryByLabelText('Image budget')).toBeNull();
    expect(document.querySelectorAll('.training-window-body button, .training-window-action button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(actions.startFresh).toHaveBeenCalledOnce());
    expect(actions.start).not.toHaveBeenCalled();
  });
});
