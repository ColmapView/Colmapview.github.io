import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ImageId, Point2D, Reconstruction } from '../../types/colmap';
import type { WasmReconstructionWrapper } from '../../wasm/reconstruction';
import {
  applyLazyPointCacheUpdate,
  getLazyImagePointLoadIds,
} from './imageDetailLazyPointsViewModel';

const MAX_LAZY_CACHE_SIZE = 20;
const EMPTY_LAZY_POINTS = new Map<ImageId, Point2D[]>();
const EMPTY_LAZY_LOAD_ORDER: ImageId[] = [];

interface UseLazyImagePoints2DOptions {
  reconstruction: Reconstruction | null;
  wasmReconstruction: WasmReconstructionWrapper | null;
  imageDetailId: ImageId | null;
  matchedImageId: ImageId | null;
  showPoints2D: boolean;
  showPoints3D: boolean;
  showMatchesInModal: boolean;
}

interface LazyPointCacheState {
  wasmReconstruction: WasmReconstructionWrapper | null;
  points: Map<ImageId, Point2D[]>;
  loadOrder: ImageId[];
}

interface LazyPointCacheResource {
  getSnapshot: () => LazyPointCacheState;
  subscribe: (listener: () => void) => () => void;
  sync: (options: UseLazyImagePoints2DOptions) => void;
}

function createLazyPointCacheResource(): LazyPointCacheResource {
  let snapshot: LazyPointCacheState = {
    wasmReconstruction: null,
    points: EMPTY_LAZY_POINTS,
    loadOrder: EMPTY_LAZY_LOAD_ORDER,
  };
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    sync: ({
      reconstruction,
      wasmReconstruction,
      imageDetailId,
      matchedImageId,
      showPoints2D,
      showPoints3D,
      showMatchesInModal,
    }) => {
      if (!wasmReconstruction) return;

      const cacheBelongsToCurrentWasm = snapshot.wasmReconstruction === wasmReconstruction;
      const lazyPoints2D = cacheBelongsToCurrentWasm ? snapshot.points : EMPTY_LAZY_POINTS;
      const lazyLoadOrder = cacheBelongsToCurrentWasm ? snapshot.loadOrder : EMPTY_LAZY_LOAD_ORDER;
      const idsToLoad = getLazyImagePointLoadIds({
        reconstruction,
        imageDetailId,
        matchedImageId,
        showPoints2D,
        showPoints3D,
        showMatchesInModal,
        lazyPoints2D,
      });
      if (idsToLoad.length === 0) return;

      const loadedPoints = new Map<ImageId, Point2D[]>();
      for (const id of idsToLoad) {
        loadedPoints.set(id, wasmReconstruction.getImagePoints2DArray(id));
      }

      const nextCache = applyLazyPointCacheUpdate({
        currentPoints: lazyPoints2D,
        currentLoadOrder: lazyLoadOrder,
        loadedPoints,
        maxCacheSize: MAX_LAZY_CACHE_SIZE,
      });

      snapshot = {
        wasmReconstruction,
        points: nextCache.points,
        loadOrder: nextCache.loadOrder,
      };
      emit();
    },
  };
}

export function useLazyImagePoints2D({
  reconstruction,
  wasmReconstruction,
  imageDetailId,
  matchedImageId,
  showPoints2D,
  showPoints3D,
  showMatchesInModal,
}: UseLazyImagePoints2DOptions): Map<ImageId, Point2D[]> {
  const resourceRef = useRef<LazyPointCacheResource | null>(null);
  resourceRef.current ??= createLazyPointCacheResource();
  const resource = resourceRef.current;
  const snapshot = useSyncExternalStore(
    resource.subscribe,
    resource.getSnapshot,
    resource.getSnapshot
  );

  useEffect(() => {
    resource.sync({
      reconstruction,
      imageDetailId,
      matchedImageId,
      showPoints2D,
      showPoints3D,
      showMatchesInModal,
      wasmReconstruction,
    });
  }, [
    imageDetailId,
    matchedImageId,
    showPoints2D,
    showPoints3D,
    showMatchesInModal,
    wasmReconstruction,
    reconstruction,
    resource,
  ]);

  return snapshot.wasmReconstruction === wasmReconstruction ? snapshot.points : EMPTY_LAZY_POINTS;
}
