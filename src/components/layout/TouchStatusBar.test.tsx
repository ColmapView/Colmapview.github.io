import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore } from '../../store/reconstructionStore';
import { useUIStore } from '../../store/stores/uiStore';
import { useTrainingStore } from '../../store/stores/trainingStore';
import { TouchStatusBar } from './TouchStatusBar';
import {
  TOUCH_STATUS_BAR_HELP_LABEL,
  TOUCH_STATUS_BAR_HELP_TITLE,
} from './statusBarViewModel';

describe('TouchStatusBar', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useTrainingStore.setState(useTrainingStore.getInitialState(), true);
  });

  afterEach(() => {
    cleanup();
  });

  it('opens the help panel from the only pointer route touch mode has', () => {
    render(<TouchStatusBar />);

    expect(useUIStore.getState().showHotkeyHelp).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: TOUCH_STATUS_BAR_HELP_TITLE }));

    expect(useUIStore.getState().showHotkeyHelp).toBe(true);
  });

  it('sizes the tap target from the bar itself, not a synthetic tap box', () => {
    render(<TouchStatusBar />);

    const help = screen.getByRole('button', { name: TOUCH_STATUS_BAR_HELP_TITLE });

    expect(help).toHaveTextContent(TOUCH_STATUS_BAR_HELP_LABEL);
    // h-11 is 2.75rem = 44px in index.css, and the compact ladder has no
    // override for it. Border box, so the 1px border-t leaves 43px of content
    // for the button — 1px under the 44px guideline, above the 40px desktop bar.
    expect(help.closest('footer')?.className).toContain('h-11');
    // The bar is `flex items-center`, which sizes its children to their own
    // content, so the button only inherits that 43px if it stretches. Without
    // this the button's real box is one text-xs line (~16px) and the
    // honest-height claim above is a lie.
    expect(help.className).toContain('self-stretch');
    // No synthetic box on top: touch-hit-44 centered on the old 24px bar
    // overhung 10px of live canvas above and stole orbit gestures. `relative`
    // went with it — it existed only to anchor that ::before.
    expect(help.className).not.toContain('touch-hit-44');
    expect(help.className).not.toContain('relative');
  });

  it('hides the entry with the bar it lives in', () => {
    useUIStore.setState({
      touchUI: {
        ...useUIStore.getState().touchUI,
        statusBar: false,
      },
    });

    render(<TouchStatusBar />);

    expect(screen.queryByRole('button', { name: TOUCH_STATUS_BAR_HELP_TITLE })).toBeNull();
  });

  it('opens the training sheet from a compact active-job status', () => {
    useTrainingStore.setState({ phase: 'running' });
    render(<TouchStatusBar />);

    fireEvent.click(screen.getByRole('button', { name: 'Training · Running' }));

    expect(useTrainingStore.getState().dockOpen).toBe(true);
  });
});
