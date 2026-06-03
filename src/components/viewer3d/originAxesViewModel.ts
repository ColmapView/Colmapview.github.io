import type { AxesCoordinateSystem, AxisLabelMode } from '../../store/types';
import { AXIS_SEMANTIC, COORDINATE_SYSTEMS } from '../../utils/coordinateSystems';
import { COORDINATE_SYSTEM_NAMES } from './originAxesConstants';

export type OriginAxisLabel = 'X' | 'Y' | 'Z';

export interface OriginAxisColors {
  x: number;
  y: number;
  z: number;
}

export interface OriginAxisDisplayEntry {
  direction: [number, number, number];
  color: number;
  label: OriginAxisLabel;
  isXAxis: boolean;
  suffix?: string;
}

export interface OriginNegativeAxisEntry {
  direction: [number, number, number];
}

export interface OriginAxesDimensions {
  axisLength: number;
  axisRadius: number;
  negativeAxisLength: number;
  labelOffset: number;
  fontSize: number;
}

export interface OriginAxesLabelState {
  showLabels: boolean;
  showExtra: boolean;
  scaleLabel: string;
}

export function getOriginAxesDimensions(size: number): OriginAxesDimensions {
  const axisLength = size * 0.5;

  return {
    axisLength,
    axisRadius: size * 0.005,
    negativeAxisLength: axisLength * 0.4,
    labelOffset: axisLength * 1.15,
    fontSize: size * 0.08,
  };
}

export function getOriginAxesLabelState(
  labelMode: AxisLabelMode,
  scale: number
): OriginAxesLabelState {
  return {
    showLabels: labelMode !== 'off',
    showExtra: labelMode === 'extra',
    scaleLabel: scale.toPrecision(3),
  };
}

export function getOriginAxisDisplayEntries(
  coordinateSystem: AxesCoordinateSystem,
  colors: OriginAxisColors
): OriginAxisDisplayEntry[] {
  const system = COORDINATE_SYSTEMS[coordinateSystem];

  return [
    {
      direction: system.y,
      color: colors.y,
      label: 'Y',
      isXAxis: false,
      suffix: AXIS_SEMANTIC[coordinateSystem].Y,
    },
    {
      direction: system.x,
      color: colors.x,
      label: 'X',
      isXAxis: true,
    },
    {
      direction: system.z,
      color: colors.z,
      label: 'Z',
      isXAxis: false,
      suffix: COORDINATE_SYSTEM_NAMES[coordinateSystem],
    },
  ];
}

function negateAxisValue(value: number): number {
  const negated = -value;
  return Object.is(negated, -0) ? 0 : negated;
}

export function getNegativeOriginAxisEntries(
  axes: readonly OriginAxisDisplayEntry[]
): OriginNegativeAxisEntry[] {
  return axes.map((axis) => ({
    direction: [
      negateAxisValue(axis.direction[0]),
      negateAxisValue(axis.direction[1]),
      negateAxisValue(axis.direction[2]),
    ],
  }));
}
