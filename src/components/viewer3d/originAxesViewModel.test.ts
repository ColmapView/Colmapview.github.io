import { describe, expect, it } from 'vitest';
import {
  getNegativeOriginAxisEntries,
  getOriginAxesDimensions,
  getOriginAxesLabelState,
  getOriginAxisDisplayEntries,
} from './originAxesViewModel';

const axisColors = {
  x: 0xff0000,
  y: 0x00ff00,
  z: 0x0000ff,
};

describe('origin axes view model', () => {
  it('derives stable dimensions from the requested size', () => {
    expect(getOriginAxesDimensions(10)).toEqual({
      axisLength: 5,
      axisRadius: 0.05,
      negativeAxisLength: 2,
      labelOffset: 5.75,
      fontSize: 0.8,
    });
  });

  it('derives label visibility and formatted scale text', () => {
    expect(getOriginAxesLabelState('off', 12.345)).toEqual({
      showLabels: false,
      showExtra: false,
      scaleLabel: '12.3',
    });

    expect(getOriginAxesLabelState('xyz', 0.012345)).toEqual({
      showLabels: true,
      showExtra: false,
      scaleLabel: '0.0123',
    });

    expect(getOriginAxesLabelState('extra', 1)).toEqual({
      showLabels: true,
      showExtra: true,
      scaleLabel: '1.00',
    });
  });

  it('orders display axes by up-axis priority and adds semantic suffixes', () => {
    expect(getOriginAxisDisplayEntries('blender', axisColors)).toEqual([
      {
        direction: [0, 0, -1],
        color: axisColors.y,
        label: 'Y',
        isXAxis: false,
        suffix: 'Fwd',
      },
      {
        direction: [1, 0, 0],
        color: axisColors.x,
        label: 'X',
        isXAxis: true,
      },
      {
        direction: [0, 1, 0],
        color: axisColors.z,
        label: 'Z',
        isXAxis: false,
        suffix: 'Blender',
      },
    ]);
  });

  it('derives negative axes by reversing display directions', () => {
    const axes = getOriginAxisDisplayEntries('unity', axisColors);

    expect(getNegativeOriginAxisEntries(axes)).toEqual([
      { direction: [0, -1, 0] },
      { direction: [-1, 0, 0] },
      { direction: [0, 0, 1] },
    ]);
  });
});
