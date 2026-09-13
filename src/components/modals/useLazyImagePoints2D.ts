import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ImageId, Point2D, Reconstruction } from '../../types/colmap';
import type { ReconstructionSource } from '../../wasm/reconstructionService';
import { isReconstructionSnapshot } from '../../wasm/reconstructionService';
import { appLogger } from '../../utils/logger';
import {
  applyLazyPointCacheUpdate,
  getLazyImagePointLoadIds,
} from './imageDetailLazyPointsViewModel';

const MAX_LAZY_CACHE_SIZE = 20;
const EMPTY_LAZY_POINTS = new Map<ImageId, Point2D[]>();
const EMPTY_LAZY_LOAD_ORDER: ImageId[] = [];

interface UseLazyImagePoints2DOptions {
  reconstruction: Reconstruction | null;
  wasmReconstruction: ReconstructionSource | null;
  imageDetailId: ImageId | null;
  matchedImageId: ImageId | null;
  showPoints2D: boolean;
  showPoints3D: boolean;
  showMatchesInModal: boolean;
}

interface LazyPointCacheState {
  wasmReconstruction: ReconstructionSource | null;
  points: Map<ImageId, Point2D[]>;
  loadOrder: ImageId[];
}

interface LazyPointCacheResource {
  getSnapshot: () => LazyPointCacheState;
  subscribe: (listener: () => void) => () => void;
  sync: (options: UseLazyImagePoints2DOptions) => void;
  cancel: () => void;
}

function createLazyPointCacheResource(): LazyPointCacheResource {
  let snapshot: LazyPointCacheState = {
    wasmReconstruction: null,
    points: EMPTY_LAZY_POINTS,
    loadOrder: EMPTY_LAZY_LOAD_ORDER,
  };
  const listeners = new Set<() => void>();
  let controller: AbortController | null = null;

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
    cancel: () => controller?.abort(),
    sync: ({
      reconstruction,
      wasmReconstruction,
      imageDetailId,
      matchedImageId,
      showPoints2D,
      showPoints3D,
      showMatchesInModal,
    }) => {
      controller?.abort();
      controller = new AbortController();
      const { signal } = controller;
      if (snapshot.wasmReconstruction !== wasmReconstruction) {
        // A dormant modal must not pin the previous dataset's large render snapshot.
        snapshot = { wasmReconstruction: null, points: EMPTY_LAZY_POINTS, loadOrder: EMPTY_LAZY_LOAD_ORDER };
        emit();
      }
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

      const publish = (loadedPoints: Map<ImageId, Point2D[]>) => {
        if (signal.aborted) return;
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
      };
      if (isReconstructionSnapshot(wasmReconstruction)) {
        void wasmReconstruction.observations(idsToLoad, signal).then(publish).catch(error => {
          if (!signal.aborted) appLogger.warn('Could not load image observations:', error);
        });
      } else {
        const loadedPoints = new Map<ImageId, Point2D[]>();
        for (const id of idsToLoad) loadedPoints.set(id, wasmReconstruction.getImagePoints2DArray(id));
        publish(loadedPoints);
      }
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
    return resource.cancel;
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
