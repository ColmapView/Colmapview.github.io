import { describe, expect, it } from 'vitest';
import {
  RIG_COLOR_MODE_OPTIONS,
  RIG_DISPLAY_MODE_OPTIONS,
  getDetectedRigHint,
  shouldEnableRigCycle,
  shouldShowRigHueControl,
} from './rigPanelViewModel';

describe('rig panel view-model helpers', () => {
  it('defines stable rig display mode labels', () => {
    expect(RIG_DISPLAY_MODE_OPTIONS).toEqual([
      { value: 'static', label: 'Static' },
      { value: 'blink', label: 'Blink' },
    ]);
  });

  it('defines stable rig color mode labels', () => {
    expect(RIG_COLOR_MODE_OPTIONS).toEqual([
      { value: 'single', label: 'Single' },
      { value: 'perFrame', label: 'Per Frame' },
    ]);
  });

  it('enables rig cycling only when rig data exists', () => {
    expect(shouldEnableRigCycle(true)).toBe(true);
    expect(shouldEnableRigCycle(false)).toBe(false);
  });

  it('shows the hue control only for single-color rig mode', () => {
    expect(shouldShowRigHueControl('single')).toBe(true);
    expect(shouldShowRigHueControl('perFrame')).toBe(false);
  });

  it('formats detected rig hint copy with plural counts when visible', () => {
    expect(getDetectedRigHint(2, 3, true)).toEqual({
      title: 'Detected Rig:',
      summary: '2 cameras, 3 frames',
      statusLine: 'Lines connect cameras in',
      lines: ['shared frame groups', '(COLMAP rigs/frames or matching names)'],
    });
  });

  it('formats detected rig hint copy with singular counts when hidden', () => {
    expect(getDetectedRigHint(1, 1, false)).toEqual({
      title: 'Detected Rig:',
      summary: '1 camera, 1 frame',
      statusLine: 'Connection lines hidden.',
      lines: ['shared frame groups', '(COLMAP rigs/frames or matching names)'],
    });
  });
});
