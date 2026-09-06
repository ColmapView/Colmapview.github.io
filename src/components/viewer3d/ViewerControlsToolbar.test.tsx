import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useCameraStore,
  useImageMetricsStore,
  usePointCloudStore,
  useReconstructionStore,
  useRigStore,
  useSplatBackendStore,
  useUIStore,
} from '../../store';
import { ViewerControlsToolbar } from './ViewerControlsToolbar';
import { useViewerControlsController } from './useViewerControlsController';
import { TOOLBAR_GROUP_LABELS } from './viewerControlsLayoutPolicy';

/**
 * Contract: the toolbar's four visual clusters are also announced clusters.
 * The hairline dividers are aria-hidden decoration, so without the group
 * wrappers a screen reader hears one flat run of sixteen controls.
 */
function ToolbarHarness() {
  const controller = useViewerControlsController();
  return <ViewerControlsToolbar controller={controller} />;
}

describe('ViewerControlsToolbar cluster semantics', () => {
  beforeEach(() => {
    useImageMetricsStore.setState(useImageMetricsStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    useCameraStore.setState(useCameraStore.getInitialState(), true);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useSplatBackendStore.setState(useSplatBackendStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useRigStore.setState(useRigStore.getInitialState(), true);
  });

  it('announces the four clusters in column order', () => {
    render(<ToolbarHarness />);

    const groups = screen.getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      TOOLBAR_GROUP_LABELS.view,
      TOOLBAR_GROUP_LABELS.data,
      TOOLBAR_GROUP_LABELS.capture,
      TOOLBAR_GROUP_LABELS.app,
    ]);
  });

  it('puts every control inside a cluster and every divider outside one', () => {
    render(<ToolbarHarness />);

    const toolbar = screen.getByTestId('viewer-controls');
    const grouped = screen
      .getAllByRole('group')
      .flatMap((group) => [...within(group).getAllByRole('button')]);

    // No control may sit between the groups: a panel added outside a wrapper
    // would be the one control the screen reader hears with no cluster.
    expect(grouped).toEqual([...toolbar.querySelectorAll('button')]);
    expect(grouped.length).toBeGreaterThan(5);

    // Dividers stay direct children of the flex column, between the groups.
    for (const divider of toolbar.querySelectorAll('div[aria-hidden="true"]')) {
      expect(divider.parentElement).toBe(toolbar);
    }
  });
});
