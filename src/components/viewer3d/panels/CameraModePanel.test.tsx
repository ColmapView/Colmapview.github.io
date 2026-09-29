import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CameraModePanel, type CameraModePanelProps } from './CameraModePanel';

afterEach(() => {
  cleanup();
});

function renderPanel(overrides: Partial<CameraModePanelProps> = {}) {
  const props: CameraModePanelProps = {
    activePanel: 'camera',
    setActivePanel: vi.fn(),
    cameraMode: 'orbit',
    setCameraMode: vi.fn(),
    flySpeed: 2.5,
    setFlySpeed: vi.fn(),
    wasdSpeed: 1,
    setWasdSpeed: vi.fn(),
    flyTransitionDuration: 600,
    setFlyTransitionDuration: vi.fn(),
    pointerLock: true,
    setPointerLock: vi.fn(),
    horizonLock: 'off',
    setHorizonLock: vi.fn(),
    autoRotateMode: 'off',
    setAutoRotateMode: vi.fn(),
    autoRotateSpeed: 0.5,
    setAutoRotateSpeed: vi.fn(),
    onToggleCameraMode: vi.fn(),
    ...overrides,
  };
  render(<CameraModePanel {...props} />);
  return props;
}

describe('CameraModePanel speed sliders', () => {
  it('controls WASD speed with its own slider, separate from fly speed', () => {
    const props = renderPanel({ wasdSpeed: 1.5 });
    const wasd = screen.getByLabelText('WASD Speed') as HTMLInputElement;
    expect(wasd.value).toBe('1.5');

    fireEvent.change(wasd, { target: { value: '0.5' } });
    expect(props.setWasdSpeed).toHaveBeenCalledWith(0.5);
    expect(props.setFlySpeed).not.toHaveBeenCalled();
  });

  it('keeps the fly speed slider for mouse and scroll movement', () => {
    renderPanel({ flySpeed: 2.5 });
    expect((screen.getByLabelText('Fly Speed') as HTMLInputElement).value).toBe('2.5');
  });
});
