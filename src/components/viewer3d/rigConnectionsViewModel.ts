import * as THREE from 'three';
import type { Image, ImageId } from '../../types/colmap';
import type { RigColorMode, RigDisplayMode } from '../../store/types';
import { getImageWorldPosition } from '../../utils/colmapTransforms';
import { getCameraColor } from '../../theme';
import { getMatchesBlinkFactor } from './cameraFrustumStylePolicy';

export interface RigConnectionGeometryData {
  positions: Float32Array;
  colors: Float32Array;
  alphas: Float32Array;
  lineFrameImageIds: Set<ImageId>[];
}

export interface RigConnectionRenderState {
  selectedImageId: ImageId | null;
  rigOpacity: number;
  unselectedOpacity: number;
  colorMode: RigColorMode;
  color: string;
}

export function getRigConnectionFrameId(imageName: string): string {
  const parts = imageName.split(/[/\\]/);
  return parts[parts.length - 1] ?? imageName;
}

export function groupRigImagesByFrame(images: Iterable<Image>): Map<string, Image[]> {
  const frameGroups = new Map<string, Image[]>();

  for (const image of images) {
    const frameId = getRigConnectionFrameId(image.name);
    const group = frameGroups.get(frameId);
    if (group) {
      group.push(image);
    } else {
      frameGroups.set(frameId, [image]);
    }
  }

  return frameGroups;
}

export function buildRigConnectionGeometryData(images: Iterable<Image>): RigConnectionGeometryData | null {
  const frameGroups = groupRigImagesByFrame(images);
  const positions: number[] = [];
  const colors: number[] = [];
  const alphas: number[] = [];
  const lineFrameImageIds: Set<ImageId>[] = [];
  let frameIndex = 0;

  for (const frameImages of frameGroups.values()) {
    if (frameImages.length < 2) continue;

    const cameraPositions = frameImages.map((image) => getImageWorldPosition(image));
    const frameImageIds = new Set(frameImages.map((image) => image.imageId));
    const frameColor = new THREE.Color(getCameraColor(frameIndex));
    frameIndex++;

    const firstPosition = cameraPositions[0];
    for (let index = 1; index < cameraPositions.length; index++) {
      const position = cameraPositions[index];

      positions.push(firstPosition.x, firstPosition.y, firstPosition.z);
      colors.push(frameColor.r, frameColor.g, frameColor.b);
      alphas.push(1);
      lineFrameImageIds.push(frameImageIds);

      positions.push(position.x, position.y, position.z);
      colors.push(frameColor.r, frameColor.g, frameColor.b);
      alphas.push(1);
      lineFrameImageIds.push(frameImageIds);
    }
  }

  if (positions.length === 0) return null;

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    alphas: new Float32Array(alphas),
    lineFrameImageIds,
  };
}

export function getRigConnectionBlinkOpacityFactor(
  displayMode: RigDisplayMode,
  phase: number
): number {
  return displayMode === 'blink' ? 0.1 + 0.9 * getMatchesBlinkFactor(phase) : 1;
}

export function getRigConnectionAlpha({
  frameImageIds,
  selectedImageId,
  rigOpacity,
  unselectedOpacity,
  blinkOpacityFactor,
}: {
  frameImageIds: Set<ImageId>;
  selectedImageId: ImageId | null;
  rigOpacity: number;
  unselectedOpacity: number;
  blinkOpacityFactor: number;
}): number {
  if (selectedImageId === null || frameImageIds.has(selectedImageId)) {
    return rigOpacity * blinkOpacityFactor;
  }

  return rigOpacity * unselectedOpacity * blinkOpacityFactor;
}

export function hasRigConnectionRenderStateChanged(
  previous: RigConnectionRenderState | null,
  current: RigConnectionRenderState
): boolean {
  return !previous ||
    previous.selectedImageId !== current.selectedImageId ||
    previous.rigOpacity !== current.rigOpacity ||
    previous.unselectedOpacity !== current.unselectedOpacity ||
    previous.colorMode !== current.colorMode ||
    previous.color !== current.color;
}

export function shouldRestoreRigConnectionFrameColors(
  previous: RigConnectionRenderState | null,
  current: RigConnectionRenderState
): boolean {
  return previous?.colorMode === 'single' && current.colorMode === 'perFrame';
}
