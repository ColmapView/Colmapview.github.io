import type { CSSProperties } from 'react';
import { DELETED_FILTER } from '../../theme';
import type { CameraId, ImageId, Reconstruction } from '../../types/colmap';
import { SensorType, type FrameId } from '../../types/rig';
import { CAMERA_MODEL_NAMES } from '../../utils/cameraModelNames';

export const DELETION_MODAL_PAGE_SIZE = 5;
export const DELETION_MODAL_ESTIMATED_WIDTH = 300;
export const DELETION_MODAL_ESTIMATED_HEIGHT = 400;

export interface DeletionCameraGroup {
  cameraId: CameraId;
  label: string;
  imageIds: ImageId[];
}

export interface DeletionFrameGroup {
  frameId: FrameId;
  label: string;
  imageIds: ImageId[];
}

export interface PendingDeletionItem {
  id: ImageId;
  name: string;
  file: File | undefined;
  cameraId: CameraId | undefined;
}

export interface DeletionBulkSelectOption {
  value: string;
  label: string;
}

export interface DeletionButtonState {
  disabled: boolean;
  className: string;
}

export interface ImageSyncSource {
  getImageSync: (name: string) => File | undefined;
}

interface DeletionModalPosition {
  x: number;
  y: number;
}

const ENABLED_INLINE_BUTTON_CLASS = 'text-ds-accent hover:bg-ds-hover';
const DISABLED_INLINE_BUTTON_CLASS = 'text-ds-muted cursor-default';
const ENABLED_PAGINATION_BUTTON_CLASS = 'text-ds-accent hover:underline';
const DISABLED_PAGINATION_BUTTON_CLASS = 'text-ds-muted cursor-default';

interface CameraGroupAccumulator {
  label: string;
  imageIds: ImageId[];
}

export function buildDeletionCameraGroups(reconstruction: Reconstruction | null): DeletionCameraGroup[] {
  if (!reconstruction) return [];

  const groups = new Map<CameraId, CameraGroupAccumulator>();

  for (const [imageId, image] of reconstruction.images) {
    let group = groups.get(image.cameraId);
    if (!group) {
      const camera = reconstruction.cameras.get(image.cameraId);
      const modelName = camera ? (CAMERA_MODEL_NAMES[camera.modelId] ?? 'Unknown') : 'Unknown';
      const resolution = camera ? `${camera.width}x${camera.height}` : '';
      group = { label: `Camera ${image.cameraId}: ${modelName} ${resolution}`, imageIds: [] };
      groups.set(image.cameraId, group);
    }
    group.imageIds.push(imageId);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a - b)
    .map(([cameraId, group]) => ({
      cameraId,
      label: `${group.label} (${formatCompactImageCount(group.imageIds.length)})`,
      imageIds: group.imageIds,
    }));
}

export function buildDeletionFrameGroups(reconstruction: Reconstruction | null): DeletionFrameGroup[] | null {
  if (!reconstruction?.rigData) return null;

  return Array.from(reconstruction.rigData.frames.entries())
    .sort(([a], [b]) => a - b)
    .map(([frameId, frame]) => {
      const imageIds = frame.dataIds
        .filter((data) => data.sensorId.type === SensorType.CAMERA && reconstruction.images.has(data.dataId))
        .map((data) => data.dataId);

      return {
        frameId,
        label: `Frame ${frameId} (${formatCompactImageCount(imageIds.length)})`,
        imageIds,
      };
    })
    .filter((group) => group.imageIds.length > 0);
}

export function getSelectedCameraGroupImageIds(
  cameraGroups: DeletionCameraGroup[],
  selectedCameraId: string
): ImageId[] {
  if (selectedCameraId === '') return [];

  const cameraId = Number(selectedCameraId);
  if (!Number.isFinite(cameraId)) return [];

  return cameraGroups.find((group) => group.cameraId === cameraId)?.imageIds ?? [];
}

export function getSelectedFrameGroupImageIds(
  frameGroups: DeletionFrameGroup[] | null,
  selectedFrameId: string
): ImageId[] {
  if (!frameGroups || selectedFrameId === '') return [];

  const frameId = Number(selectedFrameId);
  if (!Number.isFinite(frameId)) return [];

  return frameGroups.find((group) => group.frameId === frameId)?.imageIds ?? [];
}

export function getDeletionCameraSelectOptions(
  cameraGroups: DeletionCameraGroup[]
): DeletionBulkSelectOption[] {
  return cameraGroups.map((group) => ({
    value: String(group.cameraId),
    label: group.label,
  }));
}

export function getDeletionFrameSelectOptions(
  frameGroups: DeletionFrameGroup[] | null
): DeletionBulkSelectOption[] {
  return (frameGroups ?? []).map((group) => ({
    value: String(group.frameId),
    label: group.label,
  }));
}

export function getDeletionBulkAddButtonState(selectedValue: string): DeletionButtonState {
  const disabled = selectedValue === '';
  return {
    disabled,
    className: `p-1 rounded transition-colors ${
      disabled ? DISABLED_INLINE_BUTTON_CLASS : ENABLED_INLINE_BUTTON_CLASS
    }`,
  };
}

export function buildPendingDeletionItems({
  reconstruction,
  pendingDeletions,
  imageSource,
}: {
  reconstruction: Reconstruction | null;
  pendingDeletions: Set<ImageId>;
  imageSource: ImageSyncSource;
}): PendingDeletionItem[] {
  if (!reconstruction) return [];

  return Array.from(pendingDeletions)
    .map((id) => {
      const image = reconstruction.images.get(id);
      const name = image?.name ?? `Image ${id}`;
      const file = image ? imageSource.getImageSync(name) : undefined;

      return { id, name, file, cameraId: image?.cameraId };
    })
    .sort((a, b) => a.id - b.id);
}

export function getPaginatedDeletionItems<T>(
  items: T[],
  page: number,
  pageSize = DELETION_MODAL_PAGE_SIZE
): { items: T[]; totalPages: number; clampedPage: number } {
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(items.length / safePageSize));
  const normalizedPage = Number.isFinite(page) ? Math.trunc(page) : 0;
  const clampedPage = Math.max(0, Math.min(normalizedPage, totalPages - 1));

  return {
    items: items.slice(clampedPage * safePageSize, (clampedPage + 1) * safePageSize),
    totalPages,
    clampedPage,
  };
}

export function getPreviousDeletionPage(page: number): number {
  return Math.max(0, page - 1);
}

export function getNextDeletionPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, totalPages) - 1, page + 1);
}

export function getDeletionPaginationButtonState(
  direction: 'previous' | 'next',
  clampedPage: number,
  totalPages: number
): DeletionButtonState {
  const disabled = direction === 'previous'
    ? clampedPage === 0
    : clampedPage >= totalPages - 1;

  return {
    disabled,
    className: disabled ? DISABLED_PAGINATION_BUTTON_CLASS : ENABLED_PAGINATION_BUTTON_CLASS,
  };
}

export function getDeletionModalOverlayStyle(zIndex: number): CSSProperties {
  return { zIndex };
}

export function getDeletionModalPanelStyle(position: DeletionModalPosition): CSSProperties {
  return {
    left: position.x,
    top: position.y,
    width: DELETION_MODAL_ESTIMATED_WIDTH,
  };
}

export function getDeletionModalHeaderDragStyle(): CSSProperties {
  return { touchAction: 'none' };
}

export function getDeletionApplyButtonStyle(confirming: boolean): CSSProperties | undefined {
  return confirming
    ? { background: 'var(--bg-danger, #dc2626)', color: 'white' }
    : undefined;
}

export function getDeletionThumbnailImageStyle(): CSSProperties {
  return { filter: DELETED_FILTER };
}

export function shouldShowDeletionPagination(totalPages: number): boolean {
  return totalPages > 1;
}

export function getDeletionItemLabel(item: Pick<PendingDeletionItem, 'id' | 'cameraId'>, multiCamera: boolean): string {
  return multiCamera && item.cameraId != null ? `#${item.cameraId}:${item.id}` : `#${item.id}`;
}

export function getMarkedForDeletionLabel(count: number): string {
  return `${count} image${count !== 1 ? 's' : ''} marked for deletion:`;
}

export function getApplyDeletionLabel(count: number, confirming: boolean): string {
  return confirming ? `Confirm Delete (${count})` : `Apply (${count})`;
}

export function hasMultipleDeletionCameras(reconstruction: Reconstruction | null): boolean {
  return reconstruction ? reconstruction.cameras.size > 1 : false;
}

function formatCompactImageCount(count: number): string {
  return `${count} img${count !== 1 ? 's' : ''}`;
}
