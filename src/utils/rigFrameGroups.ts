import type { Image } from '../types/colmap';
import { SensorType, type RigData } from '../types/rig';

export function getRigConnectionFrameId(imageName: string): string {
  const parts = imageName.split(/[/\\]/);
  return parts[parts.length - 1] ?? imageName;
}

export function groupRigImagesByFrame(
  images: Iterable<Image>,
  rigData?: RigData
): Map<string, Image[]> {
  const groups = new Map<string, Image[]>();

  // Explicit COLMAP frames are authoritative, including single-image frames.
  // Only legacy models without rig metadata use the filename heuristic.
  if (rigData) {
    const imagesById = new Map(Array.from(images, (image) => [image.imageId, image]));
    for (const frame of rigData.frames.values()) {
      const frameImages = new Map<number, Image>();
      for (const mapping of frame.dataIds) {
        if (mapping.sensorId.type !== SensorType.CAMERA) continue;
        const image = imagesById.get(mapping.dataId);
        if (image) frameImages.set(image.imageId, image);
      }
      groups.set(String(frame.frameId), [...frameImages.values()]);
    }
    return groups;
  }

  for (const image of images) {
    const frameId = getRigConnectionFrameId(image.name);
    const group = groups.get(frameId);
    if (group) group.push(image);
    else groups.set(frameId, [image]);
  }
  return groups;
}
