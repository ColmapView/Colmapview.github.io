import type { CSSProperties } from 'react';
import {
  convertCameraModel,
  getValidTargetModels,
  type ConversionCompatibility,
  type ConversionPreview,
} from '../../utils/cameraModelConversions';
import { getCameraModelName } from '../../utils/cameraModelNames';
import { isCameraModelId } from '../../utils/cameraModelPolicy';
import { CameraModelId, type Camera, type CameraId, type Reconstruction } from '../../types/colmap';
import { STATUS_COLORS } from '../../theme';
import { parseSafeIntegerString } from '../../utils/numberParsing';

export type CameraConversionSelection = CameraId | 'all';

export interface CameraConversionOption {
  value: string;
  label: string;
}

export interface CameraConversionTarget {
  modelId: CameraModelId;
  compatibility: ConversionCompatibility;
}

export interface CameraConversionTargetOption {
  value: string;
  label: string;
}

export interface CameraConversionActionState {
  canConvert: boolean;
  label: string;
}

export interface CameraConversionParameterRow {
  name: string;
  sourceValue: number | null;
  targetValue: number;
  status: 'unchanged' | 'changed' | 'new' | 'removed';
}

export interface CameraConversionParameterRowDisplay {
  name: string;
  nameClassName: string;
  sourceClassName: string;
  sourceValueLabel: string;
  targetClassName: string;
  targetValueLabel: string;
}

export interface CameraConversionApplyResult {
  reconstruction: Reconstruction;
  convertedCount: number;
  approximateCount: number;
}

export interface CameraConversionModalPosition {
  x: number;
  y: number;
}

export const CAMERA_CONVERSION_MODAL_ESTIMATED_WIDTH = 360;
export const CAMERA_CONVERSION_MODAL_ESTIMATED_HEIGHT = 160;

export function getReconstructionCameraEntries(reconstruction: Reconstruction | null): Array<[CameraId, Camera]> {
  if (!reconstruction) return [];
  return Array.from(reconstruction.cameras.entries());
}

export function getSelectedConversionCameras(
  reconstruction: Reconstruction | null,
  selectedCameraId: CameraConversionSelection
): Camera[] {
  if (!reconstruction) return [];
  if (selectedCameraId === 'all') return Array.from(reconstruction.cameras.values());

  const camera = reconstruction.cameras.get(selectedCameraId);
  return camera ? [camera] : [];
}

export function getSourceConversionModelIds(cameras: Camera[]): CameraModelId[] {
  const models = new Set<CameraModelId>();
  for (const camera of cameras) models.add(camera.modelId);
  return Array.from(models);
}

export function getCommonConversionTargetModels(sourceModels: CameraModelId[]): CameraConversionTarget[] {
  if (sourceModels.length === 0) return [];

  const targetSets = sourceModels.map((model) =>
    new Map(getValidTargetModels(model).map((target) => [target.modelId, target.compatibility]))
  );
  const firstSet = targetSets[0];

  if (targetSets.length === 1) {
    return Array.from(firstSet.entries()).map(([modelId, compatibility]) => ({
      modelId,
      compatibility,
    }));
  }

  const commonTargets: CameraConversionTarget[] = [];

  for (const [modelId, compatibility] of firstSet) {
    let isCommon = true;
    let worstCompatibility: ConversionCompatibility = compatibility;

    for (let i = 1; i < targetSets.length; i++) {
      const otherCompatibility = targetSets[i].get(modelId);
      if (!otherCompatibility) {
        isCommon = false;
        break;
      }
      if (otherCompatibility === 'approximate') {
        worstCompatibility = 'approximate';
      }
    }

    if (isCommon) commonTargets.push({ modelId, compatibility: worstCompatibility });
  }

  return commonTargets;
}

export function getEffectiveConversionTargetModelId(
  targetModelId: CameraModelId | null,
  validTargetModels: CameraConversionTarget[]
): CameraModelId | null {
  if (targetModelId === null) return null;
  return validTargetModels.some((target) => target.modelId === targetModelId) ? targetModelId : null;
}

export function buildCameraConversionOptions(cameras: Array<[CameraId, Camera]>): CameraConversionOption[] {
  const options: CameraConversionOption[] = [];
  if (cameras.length > 1) options.push({ value: 'all', label: `All (${cameras.length})` });

  for (const [id, camera] of cameras) {
    options.push({
      value: String(id),
      label: `#${id}: ${getCameraModelName(camera.modelId)}`,
    });
  }

  return options;
}

export function buildCameraConversionTargetOptions(
  validTargetModels: CameraConversionTarget[]
): CameraConversionTargetOption[] {
  return validTargetModels.map(({ modelId, compatibility }) => ({
    value: String(modelId),
    label: `${getCameraModelName(modelId)}${compatibility === 'approximate' ? ' ~' : ''}`,
  }));
}

export function getCameraConversionActionState(
  effectiveTargetModelId: CameraModelId | null,
  selectedCameraCount: number
): CameraConversionActionState {
  const canConvert = effectiveTargetModelId !== null && selectedCameraCount > 0;
  const countSuffix = selectedCameraCount > 1 ? ` (${selectedCameraCount})` : '';

  return {
    canConvert,
    label: `Convert${countSuffix}`,
  };
}

export function parseCameraConversionSelection(
  value: string,
  options: readonly CameraConversionOption[]
): CameraConversionSelection | null {
  if (!options.some(option => option.value === value)) return null;
  if (value === 'all') return 'all';

  return parseSafeIntegerString(value);
}

export function parseCameraConversionTarget(value: string): CameraModelId | null {
  if (value === '') return null;

  const modelId = parseSafeIntegerString(value);
  return modelId !== null && isCameraModelId(modelId) ? modelId : null;
}

export function getCameraConversionModalOverlayStyle(zIndex: number): CSSProperties {
  return { zIndex };
}

export function getCameraConversionModalPanelStyle(
  position: CameraConversionModalPosition
): CSSProperties {
  return {
    left: position.x,
    top: position.y,
  };
}

export function getCameraConversionModalHeaderDragStyle(): CSSProperties {
  return { touchAction: 'none' };
}

export function buildCameraConversionParameterRows(
  conversionPreview: ConversionPreview | null
): CameraConversionParameterRow[] {
  if (!conversionPreview) return [];

  const rows: CameraConversionParameterRow[] = [];
  const allNames = new Set([
    ...conversionPreview.sourceParamNames,
    ...conversionPreview.targetParamNames,
  ]);

  for (const name of allNames) {
    const sourceIdx = conversionPreview.sourceParamNames.indexOf(name);
    const targetIdx = conversionPreview.targetParamNames.indexOf(name);

    if (sourceIdx !== -1 && targetIdx !== -1) {
      const sourceValue = conversionPreview.sourceParams[sourceIdx];
      const targetValue = conversionPreview.targetParams[targetIdx];
      rows.push({
        name,
        sourceValue,
        targetValue,
        status: Math.abs(sourceValue - targetValue) > 1e-10 ? 'changed' : 'unchanged',
      });
    } else if (sourceIdx !== -1) {
      rows.push({
        name,
        sourceValue: conversionPreview.sourceParams[sourceIdx],
        targetValue: 0,
        status: 'removed',
      });
    } else {
      rows.push({
        name,
        sourceValue: null,
        targetValue: conversionPreview.targetParams[targetIdx],
        status: 'new',
      });
    }
  }

  return rows;
}

export function applyCameraModelConversion({
  reconstruction,
  selectedCameras,
  targetModelId,
}: {
  reconstruction: Reconstruction;
  selectedCameras: Camera[];
  targetModelId: CameraModelId;
}): CameraConversionApplyResult | null {
  const cameras = new Map(reconstruction.cameras);
  let convertedCount = 0;
  let approximateCount = 0;

  for (const camera of selectedCameras) {
    const result = convertCameraModel(camera, targetModelId);
    if (result.type === 'incompatible') continue;

    cameras.set(camera.cameraId, {
      ...camera,
      modelId: targetModelId,
      params: result.params,
    });
    convertedCount++;
    if (result.type === 'approximate') approximateCount++;
  }

  if (convertedCount === 0) return null;

  return {
    reconstruction: { ...reconstruction, cameras },
    convertedCount,
    approximateCount,
  };
}

export function formatCameraConversionParamValue(value: number): string {
  if (Math.abs(value) < 1e-10) return '0';
  if (Math.abs(value) >= 100 || (Math.abs(value) < 0.01 && Math.abs(value) > 0)) {
    return value.toExponential(2);
  }
  return value.toPrecision(5).replace(/\.?0+$/, '');
}

export function getCameraConversionCharacterizationClassName(
  characterization: ConversionPreview['characterization']
): string {
  switch (characterization) {
    case 'exact':
      return STATUS_COLORS.success;
    case 'expansion':
      return STATUS_COLORS.info;
    case 'lossy':
      return STATUS_COLORS.warning;
    case 'approximation':
      return STATUS_COLORS.caution;
  }
}

export function getCameraConversionParameterRowDisplay(
  row: CameraConversionParameterRow
): CameraConversionParameterRowDisplay {
  return {
    name: row.name,
    nameClassName: getCameraConversionParameterNameClassName(row.status),
    sourceClassName: getCameraConversionSourceValueClassName(row.status),
    sourceValueLabel: row.sourceValue !== null ? formatCameraConversionParamValue(row.sourceValue) : '\u2014',
    targetClassName: getCameraConversionTargetValueClassName(row.status),
    targetValueLabel: row.status === 'removed' ? '\u2014' : formatCameraConversionParamValue(row.targetValue),
  };
}

export function getCameraConversionParameterNameClassName(
  status: CameraConversionParameterRow['status']
): string {
  switch (status) {
    case 'new':
      return 'flex-1 text-center px-2 text-blue-400';
    case 'removed':
      return 'flex-1 text-center px-2 text-red-400';
    case 'changed':
    case 'unchanged':
      return 'flex-1 text-center px-2 text-ds-muted';
  }
}

export function getCameraConversionSourceValueClassName(
  status: CameraConversionParameterRow['status']
): string {
  return status === 'removed'
    ? 'w-16 text-right text-red-400 line-through'
    : 'w-16 text-right text-ds-primary';
}

export function getCameraConversionTargetValueClassName(
  status: CameraConversionParameterRow['status']
): string {
  switch (status) {
    case 'new':
      return 'w-16 text-left text-blue-400';
    case 'changed':
      return 'w-16 text-left text-amber-400';
    case 'removed':
      return 'w-16 text-left text-ds-muted';
    case 'unchanged':
      return 'w-16 text-left text-ds-primary';
  }
}

export function getCameraConversionCharacterizationLabel(
  characterization: ConversionPreview['characterization']
): string {
  switch (characterization) {
    case 'exact':
      return 'Exact';
    case 'expansion':
      return 'Expansion';
    case 'lossy':
      return 'Lossy';
    case 'approximation':
      return 'Approx';
  }
}

export function getCameraConversionNotificationMessage({
  convertedCount,
  approximateCount,
  targetModelId,
}: {
  convertedCount: number;
  approximateCount: number;
  targetModelId: CameraModelId;
}): string {
  const targetName = getCameraModelName(targetModelId);
  return approximateCount > 0
    ? `Converted ${convertedCount} camera(s) to ${targetName} (~)`
    : `Converted ${convertedCount} camera(s) to ${targetName}`;
}
