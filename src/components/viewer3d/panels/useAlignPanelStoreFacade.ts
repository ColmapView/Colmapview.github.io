import {
  applyTransformPreset,
  applyTransformToData,
  usePointCloudStore,
  usePointPickingStore,
  useReconstructionStore,
  useTransformStore,
  type ColorMode,
  type PointCloudState,
  type PointPickingState,
  type TransformState,
} from '../../../store';
import type { Reconstruction } from '../../../types/colmap';
import type { ReconstructionSource } from '../../../wasm/reconstructionService';
import { selectHasPendingTransform } from './transformPanelViewModel';

interface AlignPanelDataFacade {
  reconstruction: Reconstruction | null;
  /** Only for `hasPoints()`: RANSAC floor detection needs a cloud to fit to. */
  wasmReconstruction: ReconstructionSource | null;
}

interface AlignPanelPointPickingFacade {
  pickingMode: PointPickingState['pickingMode'];
  setPickingMode: PointPickingState['setPickingMode'];
}

/**
 * Subscribed, not read on demand like the point-cloud slice below: Reset and
 * Apply are enabled by whether the transform differs from identity, so the panel
 * has to re-render when any alignment op writes one — including the picking
 * tools' own results, which land while this panel is open.
 *
 * The subscription is to the derived BOOLEAN, not the transform itself. Nothing
 * this panel draws depends on the transform's components, and subscribing to the
 * object re-rendered the panel on every frame of a gizmo drag.
 */
interface AlignPanelTransformFacade {
  hasPendingTransform: boolean;
  resetTransform: TransformState['resetTransform'];
}

/**
 * The compute-a-transform actions. Align owns these because it is the panel
 * that DERIVES a transform from the scene; `applyTransformToData` is the commit
 * both panels share, so it appears in the transform panel's facade too — one
 * store value, two views of it, not two states.
 */
interface AlignPanelActionFacade {
  applyTransformPreset: typeof applyTransformPreset;
  applyTransformToData: typeof applyTransformToData;
}

export interface AlignPanelPointCloudSnapshot {
  showPointCloud: boolean;
  colorMode: ColorMode;
}

interface AlignPanelPointCloudFacade {
  /**
   * Read on demand rather than subscribed. The panel needs these two values
   * only inside its arm-a-tool handler, and subscribing re-rendered the whole
   * toolbar entry every time point-cloud visibility or the color mode changed
   * anywhere else in the app.
   */
  getPointCloudSnapshot: () => AlignPanelPointCloudSnapshot;
  setShowPointCloud: PointCloudState['setShowPointCloud'];
  setColorMode: PointCloudState['setColorMode'];
}

// Module scope, so the identity is stable across renders and handlers closing
// over it need no dependency on it.
function getPointCloudSnapshot(): AlignPanelPointCloudSnapshot {
  const { showPointCloud, colorMode } = usePointCloudStore.getState();
  return { showPointCloud, colorMode };
}

export interface AlignPanelStoreFacade {
  data: AlignPanelDataFacade;
  pointPicking: AlignPanelPointPickingFacade;
  pointCloud: AlignPanelPointCloudFacade;
  transform: AlignPanelTransformFacade;
  actions: AlignPanelActionFacade;
}

export function useAlignPanelStoreFacade(): AlignPanelStoreFacade {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);

  const pickingMode = usePointPickingStore((s) => s.pickingMode);
  const setPickingMode = usePointPickingStore((s) => s.setPickingMode);

  const setShowPointCloud = usePointCloudStore((s) => s.setShowPointCloud);
  const setColorMode = usePointCloudStore((s) => s.setColorMode);

  const hasPendingTransform = useTransformStore(selectHasPendingTransform);
  const resetTransform = useTransformStore((s) => s.resetTransform);

  return {
    data: {
      reconstruction,
      wasmReconstruction,
    },
    pointPicking: {
      pickingMode,
      setPickingMode,
    },
    pointCloud: {
      getPointCloudSnapshot,
      setShowPointCloud,
      setColorMode,
    },
    transform: {
      hasPendingTransform,
      resetTransform,
    },
    actions: {
      applyTransformPreset,
      applyTransformToData,
    },
  };
}
