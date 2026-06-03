import { useEffect, useRef, useSyncExternalStore, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrustumTexture, useSelectedImageTexture } from '../../hooks/useFrustumTexture';
import {
  getFrustumPlaneDisplayTexture,
  getFrustumPlaneMaterialTexture,
  getFrustumPlaneSourceTexture,
  shouldShowFrustumPlaneTexture,
} from './frustumPlaneTexturePolicy';

interface FrustumPlaneDisplayTextureOptions {
  imageFile?: File;
  imageName: string;
  isSelected: boolean;
  materialRef: RefObject<THREE.MeshBasicMaterial | null>;
  showImagePlane: boolean;
  viewAngleOk: boolean;
}

interface LastTextureResource {
  getSnapshot: () => THREE.Texture | null;
  subscribe: (listener: () => void) => () => void;
  sync: (texture: THREE.Texture | null) => void;
}

function createLastTextureResource(): LastTextureResource {
  let lastTexture: THREE.Texture | null = null;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    getSnapshot: () => lastTexture,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    sync: (texture) => {
      if (!texture || texture === lastTexture) return;
      lastTexture = texture;
      emit();
    },
  };
}

export function useFrustumPlaneDisplayTexture({
  imageFile,
  imageName,
  isSelected,
  materialRef,
  showImagePlane,
  viewAngleOk,
}: FrustumPlaneDisplayTextureOptions) {
  const lowResTexture = useFrustumTexture(imageFile, imageName, showImagePlane);
  const highResTexture = useSelectedImageTexture(imageFile, imageName, isSelected && showImagePlane);
  const sourceTexture = getFrustumPlaneSourceTexture({
    isSelected,
    highResTexture,
    lowResTexture,
  });

  const lastTextureResourceRef = useRef<LastTextureResource | null>(null);
  lastTextureResourceRef.current ??= createLastTextureResource();
  const lastTextureResource = lastTextureResourceRef.current;
  const lastTexture = useSyncExternalStore(
    lastTextureResource.subscribe,
    lastTextureResource.getSnapshot,
    lastTextureResource.getSnapshot
  );

  useEffect(() => {
    lastTextureResource.sync(sourceTexture);
  }, [lastTextureResource, sourceTexture]);

  const displayTexture = getFrustumPlaneDisplayTexture({
    currentTexture: sourceTexture,
    lastTexture,
  });
  const shouldShowTexture = shouldShowFrustumPlaneTexture({
    showImagePlane,
    hasDisplayTexture: Boolean(displayTexture),
    viewAngleOk,
  });
  const materialTexture = getFrustumPlaneMaterialTexture({
    shouldShowTexture,
    displayTexture,
  });

  useEffect(() => {
    const material = materialRef.current;
    if (!material || material.map === materialTexture) return;

    material.map = materialTexture;
    material.needsUpdate = true;
  }, [materialRef, materialTexture]);

  return {
    displayTexture,
    shouldShowTexture,
  };
}
