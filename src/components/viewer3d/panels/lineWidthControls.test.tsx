import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CameraDisplayPanel } from './CameraDisplayPanel';
import { MatchesPanel } from './MatchesPanel';
import { RigPanel } from './RigPanel';

afterEach(() => {
  cleanup();
});

function getSliderInRow(labelText: string): HTMLElement {
  const label = screen.getByText(labelText);
  const row = label.closest('div');
  if (!row) {
    throw new Error(`Missing row for ${labelText}`);
  }
  return within(row).getByRole('slider');
}

describe('viewer line width controls', () => {
  it('routes the camera frustum line-width slider', () => {
    const setFrustumLineWidth = vi.fn();

    render(
      <CameraDisplayPanel
        activePanel="scale"
        setActivePanel={vi.fn()}
        showCameras={true}
        setShowCameras={vi.fn()}
        cameraDisplayMode="frustum"
        setCameraDisplayMode={vi.fn()}
        frustumColorMode="byCamera"
        setFrustumColorMode={vi.fn()}
        hasRigData={false}
        frustumSingleColor="#ff0000"
        onFrustumColorPickerChange={vi.fn()}
        frustumHsl={{ h: 0, s: 100, l: 50 }}
        onFrustumHueChange={vi.fn()}
        onFrustumSaturationChange={vi.fn()}
        onFrustumLightnessChange={vi.fn()}
        cameraScaleFactor="1"
        setCameraScaleFactor={vi.fn()}
        cameraScale={0.1}
        setCameraScale={vi.fn()}
        frustumStandbyOpacity={0.5}
        setFrustumStandbyOpacity={vi.fn()}
        frustumLineWidth={2}
        setFrustumLineWidth={setFrustumLineWidth}
        selectionPlaneOpacity={0.4}
        setSelectionPlaneOpacity={vi.fn()}
        unselectedCameraOpacity={0.6}
        setUnselectedCameraOpacity={vi.fn()}
        undistortionEnabled={false}
        setUndistortionEnabled={vi.fn()}
        autoFovEnabled={true}
        setAutoFovEnabled={vi.fn()}
        hasActiveSplat={false}
        splatPsnrFrameReady={false}
        onCycleCameraDisplayMode={vi.fn()}
      />
    );

    const slider = getSliderInRow('Line Width');
    expect(slider).toHaveValue('2');

    fireEvent.change(slider, { target: { value: '4.5' } });

    expect(setFrustumLineWidth).toHaveBeenCalledWith(4.5);
  });

  it('routes the match line-width slider when matches are visible', () => {
    const setMatchesLineWidth = vi.fn();

    render(
      <MatchesPanel
        activePanel="matches"
        setActivePanel={vi.fn()}
        button={{ icon: 'matchesStatic', tooltip: 'Matches static', isActive: true }}
        showMatches={true}
        setShowMatches={vi.fn()}
        matchesDisplayMode="static"
        setMatchesDisplayMode={vi.fn()}
        matchesOpacity={0.8}
        setMatchesOpacity={vi.fn()}
        matchesColor="#00ff00"
        setMatchesColor={vi.fn()}
        matchesLineWidth={1.5}
        setMatchesLineWidth={setMatchesLineWidth}
        onCycleMatchesDisplayMode={vi.fn()}
      />
    );

    const slider = getSliderInRow('Width');
    expect(slider).toHaveValue('1.5');

    fireEvent.change(slider, { target: { value: '3.5' } });

    expect(setMatchesLineWidth).toHaveBeenCalledWith(3.5);
  });

  it('routes the rig line-width slider when rig connections are visible', () => {
    const setRigLineWidth = vi.fn();

    render(
      <RigPanel
        activePanel="rig"
        setActivePanel={vi.fn()}
        button={{ icon: 'rigStatic', label: 'RIG', tooltip: 'Rig static', isActive: true }}
        hasRigData={true}
        showRig={true}
        setShowRig={vi.fn()}
        rigDisplayMode="static"
        setRigDisplayMode={vi.fn()}
        rigColorMode="single"
        setRigColorMode={vi.fn()}
        rigLineColor="#0000ff"
        setRigLineColor={vi.fn()}
        rigLineOpacity={0.7}
        setRigLineOpacity={vi.fn()}
        rigLineWidth={2.5}
        setRigLineWidth={setRigLineWidth}
        cameraCount={2}
        frameCount={1}
        onCycleRigDisplayMode={vi.fn()}
      />
    );

    const slider = getSliderInRow('Width');
    expect(slider).toHaveValue('2.5');

    fireEvent.change(slider, { target: { value: '5' } });

    expect(setRigLineWidth).toHaveBeenCalledWith(5);
  });
});
