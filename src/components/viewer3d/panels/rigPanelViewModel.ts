import type { RigColorMode, RigDisplayMode } from '../../../store/types';

interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface DetectedRigHint {
  title: string;
  summary: string;
  statusLine: string;
  lines: [string, string];
}

export const RIG_DISPLAY_MODE_OPTIONS: SelectOption<RigDisplayMode>[] = [
  { value: 'static', label: 'Static' },
  { value: 'blink', label: 'Blink' },
];

export const RIG_COLOR_MODE_OPTIONS: SelectOption<RigColorMode>[] = [
  { value: 'single', label: 'Single' },
  { value: 'perFrame', label: 'Per Frame' },
];

function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count !== 1 ? 's' : ''}`;
}

export function shouldEnableRigCycle(hasRigData: boolean): boolean {
  return hasRigData;
}

export function shouldShowRigHueControl(rigColorMode: RigColorMode): boolean {
  return rigColorMode === 'single';
}

export function getDetectedRigHint(
  cameraCount: number,
  frameCount: number,
  showRig: boolean
): DetectedRigHint {
  return {
    title: 'Detected Rig:',
    summary: `${pluralize(cameraCount, 'camera')}, ${pluralize(frameCount, 'frame')}`,
    statusLine: showRig ? 'Lines connect cameras in' : 'Connection lines hidden.',
    lines: ['shared frame groups', '(COLMAP rigs/frames or matching names)'],
  };
}
