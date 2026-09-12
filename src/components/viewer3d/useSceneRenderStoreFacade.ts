import {
  useCameraStore,
  useDeletionStore,
  useExportStore,
  useFloorPlaneStore,
  useImageMetricsStore,
  usePointCloudStore,
  usePointPickingStore,
  useReconstructionStore,
  useRigStore,
  useTransformStore,
  useUIStore,
} from '../../store';
import { getSceneFrameloop, hasSceneStateChange, needsContinuousSelectionFrames } from './sceneRenderActivityPolicy';

export function useSceneRenderStoreFacade(): { frameloop: 'always' | 'demand' } {
  // Backend progressive work and all recording implementations retain continuous frames.
  const splat = useReconstructionStore((s) => Boolean(s.loadedFiles?.splatFile));
  const recording = useExportStore((s) => s.isRecordingGif);
  const autoRotate = useCameraStore((s) => s.cameraMode === 'orbit' && s.autoRotateMode !== 'off');
  const selected = useCameraStore((s) => s.selectedImageId !== null);
  // Keep the first animated selection on an already-running loop. Static image
  // selection and reconstructions without selectable images remain demand-eligible.
  const hasSelectableImages = useReconstructionStore((s) => (s.reconstruction?.images.size ?? 0) > 0);
  const selectionColorMode = useCameraStore((s) => s.selectionColorMode);
  const animatedMatches = useUIStore((s) => s.showMatches && s.matchesDisplayMode === 'blink');
  const animatedRigs = useRigStore((s) => s.showRig && s.rigDisplayMode === 'blink');
  const floorPulse = useFloorPlaneStore((s) => s.detectedPlane !== null);

  const frameloop = getSceneFrameloop({
    splat, recording, autoRotate,
    animatedSelection: needsContinuousSelectionFrames(hasSelectableImages, selectionColorMode),
    animatedMatches: selected && animatedMatches,
    animatedRigs, floorPulse,
  });
  return { frameloop };
}

export function subscribeSceneRenderStores(wake: () => void): () => void {
  const subscriptions = [
    useUIStore.subscribe((next, previous) => {
      if (hasSceneStateChange(next, previous, ['fps'])) wake();
    }),
    useCameraStore.subscribe((next, previous) => {
      if (hasSceneStateChange(next, previous, ['currentViewState', 'navigationHistory'])) wake();
    }),
    useReconstructionStore.subscribe(wake),
    usePointCloudStore.subscribe(wake),
    usePointPickingStore.subscribe(wake),
    useTransformStore.subscribe(wake),
    useFloorPlaneStore.subscribe(wake),
    useDeletionStore.subscribe(wake),
    useRigStore.subscribe(wake),
    useImageMetricsStore.subscribe(wake),
    useExportStore.subscribe(wake),
  ];
  return () => subscriptions.forEach((unsubscribe) => unsubscribe());
}
