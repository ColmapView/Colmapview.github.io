import {
  useAxesNode,
  useAxesNodeActions,
  useCamerasNode,
  useCamerasNodeActions,
  useGridNode,
  useGridNodeActions,
  useMatchesNode,
  useMatchesNodeActions,
  useNavigationNode,
  useNavigationNodeActions,
  usePointsNode,
  usePointsNodeActions,
  useRigNode,
  useRigNodeActions,
  useSelectionNode,
  useSelectionNodeActions,
  type AxesNode,
  type AxesNodeActions,
  type CamerasNode,
  type CamerasNodeActions,
  type GridNode,
  type GridNodeActions,
  type MatchesNode,
  type MatchesNodeActions,
  type NavigationNode,
  type NavigationNodeActions,
  type PointsNode,
  type PointsNodeActions,
  type RigNode,
  type RigNodeActions,
  type SelectionNode,
  type SelectionNodeActions,
} from '../../nodes';
import {
  useImageMetricsStore,
  useReconstructionStore,
  useSplatBackendStore,
  useUIStore,
  type UIState,
} from '../../store';
import {
  shouldExposeSplatMetricVisualizations,
  type SplatMetricCapability,
} from '../../utils/splatBackendPolicy';
import type { Reconstruction, SplatFileSource } from '../../types/colmap';
import { getActiveSplatSourceId, loadedFilesHaveSplatData } from '../../utils/splatFileSourcePolicy';

interface ViewerControlsUiFacade {
  touchMode: boolean;
  backgroundColor: string;
  setBackgroundColor: UIState['setBackgroundColor'];
  setView: UIState['setView'];
  autoHideButtons: boolean;
}

interface ViewerControlsNodeFacade {
  points: PointsNode;
  cameras: CamerasNode;
  selection: SelectionNode;
  navigation: NavigationNode;
  matches: MatchesNode;
  axes: AxesNode;
  grid: GridNode;
  rig: RigNode;
}

interface ViewerControlsActionFacade {
  points: PointsNodeActions;
  cameras: CamerasNodeActions;
  selection: SelectionNodeActions;
  navigation: NavigationNodeActions;
  matches: MatchesNodeActions;
  axes: AxesNodeActions;
  grid: GridNodeActions;
  rig: RigNodeActions;
}

interface ViewerControlsMetricsFacade {
  splatPsnrFrameReady: boolean;
  splatPsnrComputing: boolean;
  splatPsnrReadyCount: number;
  splatPsnrTotalCount: number;
  splatPsnrUnavailableReason: string | null;
  splatMetricVisualizationsAvailable: boolean;
}

interface ViewerControlsSplatFacade {
  activeSplatFile?: File;
  splatFiles: readonly File[];
  splatFileSources: readonly SplatFileSource[];
  activeSplatSourceId: string | null;
  /** Whether the dataset has any splat (active, bundled, or pickable/lazy source). */
  hasSplatData: boolean;
  setActiveSplatFile: (file: File) => void;
  selectSplatSource: (sourceId: string) => void;
}

export interface ViewerControlsStoreFacade {
  ui: ViewerControlsUiFacade;
  nodes: ViewerControlsNodeFacade;
  actions: ViewerControlsActionFacade;
  metrics: ViewerControlsMetricsFacade;
  splats: ViewerControlsSplatFacade;
  reconstruction: Reconstruction | null;
}

const EMPTY_SPLAT_FILES: readonly File[] = [];
const EMPTY_SPLAT_SOURCES: readonly SplatFileSource[] = [];

function getSplatPsnrUnavailableReason(
  activeSplatFile: File | undefined,
  metricCapability: SplatMetricCapability
): string | null {
  if (!activeSplatFile || metricCapability.gpuPsnr) {
    return null;
  }

  return metricCapability.reason;
}

export function useViewerControlsStoreFacade(): ViewerControlsStoreFacade {
  const touchMode = useUIStore((s) => s.touchMode);
  const backgroundColor = useUIStore((s) => s.backgroundColor);
  const setBackgroundColor = useUIStore((s) => s.setBackgroundColor);
  const setView = useUIStore((s) => s.setView);
  const autoHideButtons = useUIStore((s) => s.autoHideElements.buttons);
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const loadedFiles = useReconstructionStore((s) => s.loadedFiles);
  const splatPsnrFrameReady = useImageMetricsStore((s) => s.splatPsnrFrameReady);
  const splatPsnrComputing = useImageMetricsStore((s) => s.splatPsnrComputing);
  const splatPsnrReadyCount = useImageMetricsStore((s) => s.splatPsnrMetrics.size);
  const splatBackendResolution = useSplatBackendStore((s) => s.resolution);
  const splatMetricAvailability = useSplatBackendStore((s) => s.metricAvailability);
  const splatMetricCapability = useSplatBackendStore((s) => s.metricCapability);
  const activeSplatFile = loadedFiles?.splatFile;
  const splatFiles = loadedFiles?.splatFiles ?? (activeSplatFile ? [activeSplatFile] : EMPTY_SPLAT_FILES);
  const splatFileSources = loadedFiles?.splatFileSources ?? EMPTY_SPLAT_SOURCES;
  const activeSplatSourceId = getActiveSplatSourceId(loadedFiles ?? null);
  const splatPsnrUnavailableReason = getSplatPsnrUnavailableReason(activeSplatFile, splatMetricCapability);
  const splatMetricVisualizationsAvailable = shouldExposeSplatMetricVisualizations({
    activeSplatFile,
    resolution: splatBackendResolution,
    metricAvailability: splatMetricAvailability,
    metricCapability: splatMetricCapability,
  });

  const setActiveSplatFile = (file: File) => {
    const state = useReconstructionStore.getState();
    const currentLoadedFiles = state.loadedFiles;
    const availableSplatFiles = currentLoadedFiles?.splatFiles
      ?? (currentLoadedFiles?.splatFile ? [currentLoadedFiles.splatFile] : []);

    if (!currentLoadedFiles || currentLoadedFiles.splatFile === file || !availableSplatFiles.includes(file)) {
      return;
    }

    state.setLoadedFiles({
      ...currentLoadedFiles,
      splatFile: file,
      splatFiles: availableSplatFiles,
    });
    useImageMetricsStore.getState().clearSplatPsnr();
  };

  const selectSplatSource = (sourceId: string) => {
    void useReconstructionStore.getState().selectSplatSource(sourceId);
    useImageMetricsStore.getState().clearSplatPsnr();
  };

  return {
    ui: {
      touchMode,
      backgroundColor,
      setBackgroundColor,
      setView,
      autoHideButtons,
    },
    nodes: {
      points: usePointsNode(),
      cameras: useCamerasNode(),
      selection: useSelectionNode(),
      navigation: useNavigationNode(),
      matches: useMatchesNode(),
      axes: useAxesNode(),
      grid: useGridNode(),
      rig: useRigNode(),
    },
    actions: {
      points: usePointsNodeActions(),
      cameras: useCamerasNodeActions(),
      selection: useSelectionNodeActions(),
      navigation: useNavigationNodeActions(),
      matches: useMatchesNodeActions(),
      axes: useAxesNodeActions(),
      grid: useGridNodeActions(),
      rig: useRigNodeActions(),
    },
    metrics: {
      splatPsnrFrameReady,
      splatPsnrComputing,
      splatPsnrReadyCount,
      splatPsnrTotalCount: reconstruction?.images.size ?? 0,
      splatPsnrUnavailableReason,
      splatMetricVisualizationsAvailable,
    },
    splats: {
      activeSplatFile,
      splatFiles,
      splatFileSources,
      activeSplatSourceId,
      hasSplatData: loadedFilesHaveSplatData(loadedFiles),
      setActiveSplatFile,
      selectSplatSource,
    },
    reconstruction,
  };
}
