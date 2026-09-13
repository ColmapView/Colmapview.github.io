import type { Reconstruction, Image, Camera, ImageStats, ConnectedImagesIndex, ImageToPoint3DIdsMap, Point3D, Point3DId } from '../types/colmap';
import type { Frame, FrameId } from '../types/rig';

/**
 * Pure function: Filter a reconstruction to remove specified images.
 * This is the core logic that can be reused by higher-level functions.
 *
 * @param reconstruction - The source reconstruction data
 * @param imageIdsToRemove - Set of image IDs to remove
 * @returns A new Reconstruction with the specified images removed, or null if no changes
 */
export function filterReconstructionByImageIds(
  reconstruction: Reconstruction,
  imageIdsToRemove: Set<number>
): Reconstruction | null {
  if (imageIdsToRemove.size === 0) return null;

  // Create new images Map excluding deleted IDs
  const newImages = new Map<number, Image>();
  for (const [id, image] of reconstruction.images) {
    if (!imageIdsToRemove.has(id)) {
      newImages.set(id, image);
    }
  }

  // Filter cameras - only keep cameras that are still used by remaining images
  const usedCameraIds = new Set<number>();
  for (const image of newImages.values()) {
    usedCameraIds.add(image.cameraId);
  }
  const newCameras = new Map<number, Camera>();
  for (const [id, camera] of reconstruction.cameras) {
    if (usedCameraIds.has(id)) {
      newCameras.set(id, camera);
    }
  }

  // Rebuild imageStats for remaining images
  const newImageStats = new Map<number, ImageStats>();
  for (const [id, stats] of reconstruction.imageStats) {
    if (!imageIdsToRemove.has(id)) {
      newImageStats.set(id, stats);
    }
  }

  // Rebuild connectedImagesIndex (matches) excluding deleted images
  const newConnectedImagesIndex: ConnectedImagesIndex = new Map();
  for (const [imageId, connections] of reconstruction.connectedImagesIndex) {
    if (!imageIdsToRemove.has(imageId)) {
      const newConnections = new Map<number, number>();
      for (const [connectedId, count] of connections) {
        if (!imageIdsToRemove.has(connectedId)) {
          newConnections.set(connectedId, count);
        }
      }
      if (newConnections.size > 0) {
        newConnectedImagesIndex.set(imageId, newConnections);
      }
    }
  }

  // Rebuild imageToPoint3DIds excluding deleted images
  const newImageToPoint3DIds: ImageToPoint3DIdsMap = new Map();
  for (const [imageId, pointIds] of reconstruction.imageToPoint3DIds) {
    if (!imageIdsToRemove.has(imageId)) {
      newImageToPoint3DIds.set(imageId, pointIds);
    }
  }

  // Rebuild points3D (tracks): filter track elements but keep all points
  // Points are kept even with 0 remaining observations - their 3D positions are still valid for visualization
  let newPoints3D: Map<Point3DId, Point3D> | undefined;
  if (reconstruction.points3D) {
    newPoints3D = new Map();
    for (const [pointId, point] of reconstruction.points3D) {
      // Filter track elements to remove references to deleted images
      const newTrack = point.track.filter(elem => !imageIdsToRemove.has(elem.imageId));

      newPoints3D.set(pointId, {
        ...point,
        track: newTrack,
      });
    }

    // Also update imageToPoint3DIds to remove orphaned point references
    for (const [imageId, pointIds] of newImageToPoint3DIds) {
      const filteredPointIds = new Set<Point3DId>();
      for (const pointId of pointIds) {
        if (newPoints3D.has(pointId)) {
          filteredPointIds.add(pointId);
        }
      }
      if (filteredPointIds.size > 0) {
        newImageToPoint3DIds.set(imageId, filteredPointIds);
      } else {
        newImageToPoint3DIds.delete(imageId);
      }
    }
  }

  // Filter rig frames: each frame.dataIds maps sensors to image IDs. Drop
  // mappings whose dataId was deleted. Frames that lose all mappings are
  // removed entirely. Rigs (sensor definitions) stay untouched.
  let newRigData = reconstruction.rigData;
  if (reconstruction.rigData) {
    const newFrames = new Map<FrameId, Frame>();
    for (const [frameId, frame] of reconstruction.rigData.frames) {
      const keptDataIds = frame.dataIds.filter(d => !imageIdsToRemove.has(d.dataId));
      if (keptDataIds.length > 0) {
        newFrames.set(frameId, { ...frame, dataIds: keptDataIds });
      }
    }
    newRigData = { rigs: reconstruction.rigData.rigs, frames: newFrames };
  }

  // Create the new reconstruction object
  return {
    cameras: newCameras,
    images: newImages,
    points3D: newPoints3D,
    imageStats: newImageStats,
    connectedImagesIndex: newConnectedImagesIndex,
    globalStats: reconstruction.globalStats, // Stats are approximations, keep as-is
    imageToPoint3DIds: newImageToPoint3DIds,
    rigData: newRigData,
  };
}

