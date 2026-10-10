import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReconstructionStore, useUIStore } from '../../../store';
import { useFloorPlaneStore } from '../../../store/stores/floorPlaneStore';
import { buildReconstruction, buildWasmReconstructionWrapper } from '../../../test/builders';
import { SettingsPanel, type SettingsPanelProps } from './SettingsPanel';

function renderPanel(overrides: Partial<SettingsPanelProps> = {}) {
  const props: SettingsPanelProps = {
    activePanel: 'settings',
    setActivePanel: vi.fn(),
    ...overrides,
  };

  return { ...render(<SettingsPanel {...props} />), props };
}

describe('SettingsPanel customization', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useFloorPlaneStore.setState(useFloorPlaneStore.getInitialState(), true);
    useReconstructionStore.setState({
      reconstruction: buildReconstruction(),
      wasmReconstruction: buildWasmReconstructionWrapper({ pointCount: 3 }),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('leaves reconstruction tools in Export and Alignment', () => {
    renderPanel();
    for (const name of ['Delete Images from Model', 'Convert Camera Model', 'Floor Detection']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.queryByText('Tools')).toBeNull();
  });

  it('keeps the auto-hide editor reachable and closes Settings behind it', () => {
    useUIStore.setState({ idleHideTimeout: 3 });
    const { props } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Auto-hide 3D Elements' }));

    expect(useUIStore.getState().showAutoHideEditor).toBe(true);
    expect(props.setActivePanel).toHaveBeenCalledWith(null);
  });

  it('hides the auto-hide row while the idle timeout is off', () => {
    useUIStore.setState({ idleHideTimeout: 0 });
    renderPanel();

    expect(screen.queryByRole('button', { name: 'Auto-hide 3D Elements' })).toBeNull();
  });

  it('keeps customization available without loading a reconstruction', () => {
    useReconstructionStore.setState({ reconstruction: null, wasmReconstruction: null });
    renderPanel();

    expect(screen.queryByRole('button', { name: 'Delete Images from Model' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Auto-hide 3D Elements' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Edit Context Menu' })).toBeEnabled();
  });
});
