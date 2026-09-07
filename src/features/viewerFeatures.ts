import { z } from 'zod';
import type { FeatureContract } from './catalog';
import { useReconstructionStore } from '../store/reconstructionStore';
import { useCameraStore } from '../store/stores/cameraStore';
import { useUIStore } from '../store/stores/uiStore';
import { useTransformStore } from '../store/stores/transformStore';
import { applyTransformPreset } from '../store/actions/transformActions';

const imageInput = z.strictObject({ imageId: z.number().int().nonnegative().safe().nullable() });
function validateImage(raw: unknown) {
  const { imageId } = imageInput.parse(raw);
  if (imageId !== null && !useReconstructionStore.getState().reconstruction?.images.has(imageId)) throw new Error('Unknown image ID. Use colmap_query_images first.');
  return imageId;
}
export const viewerFeatures: FeatureContract[] = [
  {
    id: 'selection.image', title: 'Select image', group: 'selection',
    description: 'Select a dataset image by ID, or null to deselect. Does not move the viewer camera. Discover IDs with colmap_query_images.',
    input: imageInput, defaultInput: { imageId: null }, available: () => true,
    read: () => useCameraStore.getState().selectedImageId,
    apply: raw => useCameraStore.getState().setSelectedImageId(validateImage(raw)),
  },
  {
    id: 'image.open', title: 'Open image viewer', group: 'images',
    description: 'Open the normal image detail viewer for an image ID, or null to close it. Discover IDs with colmap_query_images.',
    input: imageInput, defaultInput: { imageId: null }, available: () => true,
    read: () => useUIStore.getState().imageDetailId,
    apply: raw => {
      const id = validateImage(raw);
      if (id === null) useUIStore.getState().closeImageDetail();
      else useUIStore.getState().openImageDetail(id);
    },
  },
  {
    id: 'scene.transform.preset', title: 'Transform preset', group: 'scene',
    description: 'Apply the existing identity/reset, center-at-origin or normalize-scale display preset. Does not bake changes into dataset coordinates.',
    input: z.strictObject({ preset: z.enum(['identity', 'centerAtOrigin', 'normalizeScale']) }), defaultInput: { preset: 'identity' },
    available: () => !!useReconstructionStore.getState().reconstruction,
    read: () => useTransformStore.getState().transform,
    apply: raw => {
      const { preset } = z.strictObject({ preset: z.enum(['identity', 'centerAtOrigin', 'normalizeScale']) }).parse(raw);
      if (!applyTransformPreset(preset)) throw new Error('Load a reconstruction first.');
    },
  },
];
