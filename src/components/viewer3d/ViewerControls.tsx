import { useState, useEffect, memo, useCallback, useMemo } from 'react';
import {
  useReconstructionStore,
  useUIStore,
  useTransformStore,
  usePointPickingStore,
  useNotificationStore,
  useGuideStore,
  applyTransformPreset,
  applyTransformToData,
} from '../../store';
import {
  usePointsNode,
  useCamerasNode,
  useSelectionNode,
  useNavigationNode,
  useMatchesNode,
  useAxesNode,
  useGridNode,
  useRigNode,
  usePointsNodeActions,
  useCamerasNodeActions,
  useSelectionNodeActions,
  useNavigationNodeActions,
  useMatchesNodeActions,
  useAxesNodeActions,
  useGridNodeActions,
  useRigNodeActions,
} from '../../nodes';
import { useFloorPlaneStore, type FloorColorMode } from '../../store/stores/floorPlaneStore';
import { markSettingsResetWarningShown } from '../../store/migration';
import { detectPlaneRANSAC, computeDistancesToPlane, transformPositions } from '../../utils/ransac';
import { createSim3dFromEuler, isIdentityEuler } from '../../utils/sim3dTransforms';
import type { ColorMode } from '../../types/colmap';
import type { CameraMode, CameraDisplayMode, CameraScaleFactor, FrustumColorMode, MatchesDisplayMode, SelectionColorMode, AxesCoordinateSystem, AxisLabelMode, AutoRotateMode, HorizonLockMode, RigDisplayMode, RigColorMode } from '../../store/types';
import { useHotkeys } from 'react-hotkeys-hook';
import { controlPanelStyles, HOTKEYS } from '../../theme';
import { useFileDropzone } from '../../hooks/useFileDropzone';
import { hslToHex, hexToHsl } from '../../utils/colorUtils';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import { extractConfigurationFromStores, serializeConfigToYaml } from '../../config/configuration';

// Import icons from centralized icons folder
import {
  HoverIcon,
  TransformIcon,
  FrustumIcon,
  ArrowIcon,
  CameraOffIcon,
  ImageIcon,
  MatchOffIcon,
  MatchOnIcon,
  MatchBlinkIcon,
  RainbowIcon,
  SelectionOffIcon,
  SelectionStaticIcon,
  SelectionBlinkIcon,
  AxesIcon,
  AxesOffIcon,
  AxesGridIcon,
  GridIcon,
  FloorDetectIcon,
  ColorOffIcon,
  ColorRgbIcon,
  ColorErrorIcon,
  ColorTrackIcon,
  BgIcon,
  ViewIcon,
  OrbitIcon,
  FlyIcon,
  SidebarExpandIcon,
  SidebarCollapseIcon,
  RigIcon,
  RigOffIcon,
  RigBlinkIcon,
  SettingsIcon,
} from '../../icons';

// Import UI components from ControlComponents
import {
  SliderRow,
  HueRow,
  HueSliderRow,
  SelectRow,
  ToggleRow,
  ControlButton,
  MouseScrollIcon,
  ColorPickerRow,
  type PanelType,
} from './ControlComponents';

// Import extracted panels
import { ScreenshotPanel, SharePanel, ExportPanel } from './panels';
import { ProfileSelector } from '../dropzone/ProfileSelector';

// Use styles from theme
const styles = controlPanelStyles;

// Helper to format exponent as superscript using Unicode characters
const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '-': '⁻', '.': '·',
};

function toSuperscript(n: number): string {
  const str = n.toFixed(1);
  return str.split('').map(c => SUPERSCRIPT_DIGITS[c] || c).join('');
}

// COLMAP jokes for Shift+E easter egg
const COLMAP_JOKES = [
  "Why did COLMAP break up with the blurry photo? No future together.",
  "COLMAP's dating profile: Looking for matches.",
  "My COLMAP crashed. Guess it couldn't handle my good looks.",
  "COLMAP walked into a bar. The bartender said, 'You look like you've seen some points.'",
  "Why is COLMAP bad at poker? It always shows its hand... and tracks it.",
  "COLMAP's favorite dance? The bundle adjustment shuffle.",
  "I told COLMAP a joke. It took 3 hours to get the point.",
  "COLMAP at therapy: 'I have too many issues... with my features.'",
  "Why did the point cloud go to school? To get more depth.",
  "COLMAP's life motto: When in doubt, RANSAC it out.",
];

// Transform panel component
interface TransformPanelProps {
  styles: typeof controlPanelStyles;
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
}

const TransformPanel = memo(function TransformPanel({ styles, activePanel, setActivePanel }: TransformPanelProps) {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const droppedFiles = useReconstructionStore((s) => s.droppedFiles);
  const transform = useTransformStore((s) => s.transform);
  const setTransform = useTransformStore((s) => s.setTransform);
  const resetTransform = useTransformStore((s) => s.resetTransform);
  const showGizmo = useUIStore((s) => s.showGizmo);
  const toggleGizmo = useUIStore((s) => s.toggleGizmo);
  const { processFiles } = useFileDropzone();

  // Point picking state
  const pickingMode = usePointPickingStore((s) => s.pickingMode);
  const setPickingMode = usePointPickingStore((s) => s.setPickingMode);

  const hasChanges = !isIdentityEuler(transform);

  // Convert radians to degrees for display
  const radToDeg = (rad: number) => rad * (180 / Math.PI);
  const degToRad = (deg: number) => deg * (Math.PI / 180);

  // Hotkey for toggling transform gizmo
  useHotkeys(
    HOTKEYS.toggleGizmo.keys,
    toggleGizmo,
    { scopes: HOTKEYS.toggleGizmo.scopes },
    [toggleGizmo]
  );

  const gizmoTooltip = `Transform (T): ${showGizmo ? 'On' : 'Off'}${hasChanges ? ' (dbl-click to apply)' : ''}`;

  return (
    <ControlButton
      panelId="transform"
      activePanel={activePanel}
      setActivePanel={setActivePanel}
      icon={<TransformIcon className="w-6 h-6" />}
      tooltip={gizmoTooltip}
      isActive={showGizmo}
      onClick={toggleGizmo}
      onDoubleClick={hasChanges ? applyTransformToData : undefined}
      panelTitle="Transform"
      disabled={!reconstruction}
    >
      <div className={styles.panelContent}>
        {/* Gizmo toggle */}
        <ToggleRow label="Gizmo (T)" checked={showGizmo} onChange={toggleGizmo} />

        {/* Scale */}
        <SliderRow
          label="Scale"
          value={transform.scale}
          min={0.01}
          max={10}
          step={0.01}
          onChange={(v) => setTransform({ scale: v })}
          formatValue={(v) => v.toFixed(2)}
        />

        <SliderRow
          label="Rotate-X"
          value={radToDeg(transform.rotationX)}
          min={-180}
          max={180}
          step={1}
          onChange={(v) => setTransform({ rotationX: degToRad(v) })}
          formatValue={(v) => `${v.toFixed(0)}°`}
        />
        <SliderRow
          label="Rotate-Y"
          value={radToDeg(transform.rotationY)}
          min={-180}
          max={180}
          step={1}
          onChange={(v) => setTransform({ rotationY: degToRad(v) })}
          formatValue={(v) => `${v.toFixed(0)}°`}
        />
        <SliderRow
          label="Rotate-Z"
          value={radToDeg(transform.rotationZ)}
          min={-180}
          max={180}
          step={1}
          onChange={(v) => setTransform({ rotationZ: degToRad(v) })}
          formatValue={(v) => `${v.toFixed(0)}°`}
        />
        <SliderRow
          label="Translate-X"
          value={transform.translationX}
          min={-100}
          max={100}
          step={0.1}
          onChange={(v) => setTransform({ translationX: v })}
          formatValue={(v) => v.toFixed(1)}
        />
        <SliderRow
          label="Translate-Y"
          value={transform.translationY}
          min={-100}
          max={100}
          step={0.1}
          onChange={(v) => setTransform({ translationY: v })}
          formatValue={(v) => v.toFixed(1)}
        />
        <SliderRow
          label="Translate-Z"
          value={transform.translationZ}
          min={-100}
          max={100}
          step={0.1}
          onChange={(v) => setTransform({ translationZ: v })}
          formatValue={(v) => v.toFixed(1)}
        />

        {/* Presets */}
        <div className={styles.presetGroup}>
          <button
            onClick={() => applyTransformPreset('centerAtOrigin')}
            className={styles.presetButton}
            data-tooltip="Move scene center to (0,0,0)"
            data-tooltip-pos="bottom"
          >
            Center at Origin
          </button>
        </div>

        {/* Point picking tools */}
        <div className={styles.presetGroup}>
          <button
            onClick={() => setPickingMode(pickingMode === 'origin-1pt' ? 'off' : 'origin-1pt')}
            className={pickingMode === 'origin-1pt' ? styles.actionButtonPrimary : styles.presetButton}
            data-tooltip="{LMB} Click 1 point to set as origin (0,0,0)"
            data-tooltip-pos="bottom"
          >
            1-Point Origin
          </button>
          <button
            onClick={() => setPickingMode(pickingMode === 'distance-2pt' ? 'off' : 'distance-2pt')}
            className={pickingMode === 'distance-2pt' ? styles.actionButtonPrimary : styles.presetButton}
            data-tooltip="{LMB} Click 2 points, set target distance"
            data-tooltip-pos="bottom"
          >
            2-Point Scale
          </button>
          <button
            onClick={() => setPickingMode(pickingMode === 'normal-3pt' ? 'off' : 'normal-3pt')}
            className={pickingMode === 'normal-3pt' ? styles.actionButtonPrimary : styles.presetButton}
            data-tooltip="{LMB} Click 3 points clockwise to align plane with Y-up"
            data-tooltip-pos="bottom"
          >
            3-Point Align
          </button>
        </div>


        {/* Action buttons */}
        <div className={styles.actionGroup}>
          <button
            onClick={resetTransform}
            disabled={!hasChanges}
            className={hasChanges ? styles.actionButton : styles.actionButtonDisabled}
          >
            Reset
          </button>
          <button
            onClick={() => { if (droppedFiles) { resetTransform(); processFiles(droppedFiles); } }}
            disabled={!droppedFiles}
            className={droppedFiles ? styles.actionButton : styles.actionButtonDisabled}
          >
            Reload
          </button>
          <button
            onClick={applyTransformToData}
            disabled={!hasChanges}
            className={hasChanges ? styles.actionButtonPrimary : styles.actionButtonPrimaryDisabled}
          >
            Apply
          </button>
        </div>

        {hasChanges && (
          <div className={styles.hint}>
            Transform will be applied to reconstruction data when you click "Apply".
          </div>
        )}
      </div>
    </ControlButton>
  );
});

// Floor Detection panel component
interface FloorDetectionPanelProps {
  styles: typeof controlPanelStyles;
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
}

const FloorDetectionPanel = memo(function FloorDetectionPanel({ styles, activePanel, setActivePanel }: FloorDetectionPanelProps) {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);

  // Get current transform to apply before detection
  const transform = useTransformStore((s) => s.transform);

  const detectedPlane = useFloorPlaneStore((s) => s.detectedPlane);
  const setDetectedPlane = useFloorPlaneStore((s) => s.setDetectedPlane);
  const distanceThreshold = useFloorPlaneStore((s) => s.distanceThreshold);
  const setDistanceThreshold = useFloorPlaneStore((s) => s.setDistanceThreshold);
  const sampleCount = useFloorPlaneStore((s) => s.sampleCount);
  const setSampleCount = useFloorPlaneStore((s) => s.setSampleCount);
  const floorColorMode = useFloorPlaneStore((s) => s.floorColorMode);
  const setFloorColorMode = useFloorPlaneStore((s) => s.setFloorColorMode);
  const setPointDistances = useFloorPlaneStore((s) => s.setPointDistances);
  const isDetecting = useFloorPlaneStore((s) => s.isDetecting);
  const setIsDetecting = useFloorPlaneStore((s) => s.setIsDetecting);
  const setNormalFlipped = useFloorPlaneStore((s) => s.setNormalFlipped);
  const reset = useFloorPlaneStore((s) => s.reset);

  const pointCount = wasmReconstruction?.pointCount ?? reconstruction?.points3D?.size ?? 0;

  const handleDetectFloor = useCallback(() => {
    if (!wasmReconstruction?.hasPoints()) return;

    setIsDetecting(true);

    // Use setTimeout to allow UI to update before potentially blocking operation
    setTimeout(() => {
      let positions = wasmReconstruction.getPositions();
      if (!positions) {
        setIsDetecting(false);
        return;
      }

      // Apply current transform if not identity (so detection matches visual)
      if (!isIdentityEuler(transform)) {
        const sim3d = createSim3dFromEuler(transform);
        positions = transformPositions(positions, sim3d);
      }

      const plane = detectPlaneRANSAC(positions, { distanceThreshold, sampleCount });
      setDetectedPlane(plane);

      if (plane) {
        const distances = computeDistancesToPlane(positions, plane);

        // Count points on each side of the plane
        let countOnNormalSide = 0;
        let countOnOppositeSide = 0;
        for (let i = 0; i < distances.length; i++) {
          if (distances[i] > 0) countOnNormalSide++;
          else if (distances[i] < 0) countOnOppositeSide++;
        }

        // Flip so normal points toward more points (down toward fewer)
        setNormalFlipped(countOnNormalSide < countOnOppositeSide);
        setPointDistances(distances);
        if (floorColorMode === 'off') {
          setFloorColorMode('binary');
        }
      } else {
        setPointDistances(null);
      }

      setIsDetecting(false);
    }, 10);
  }, [wasmReconstruction, distanceThreshold, sampleCount, transform, setDetectedPlane, setPointDistances, setIsDetecting, setNormalFlipped, floorColorMode, setFloorColorMode]);

  const handleClear = useCallback(() => {
    reset();
  }, [reset]);

  const inlierPercentage = detectedPlane && pointCount > 0
    ? ((detectedPlane.inlierCount / pointCount) * 100).toFixed(1)
    : null;

  return (
    <ControlButton
      panelId="floor"
      activePanel={activePanel}
      setActivePanel={setActivePanel}
      icon={<FloorDetectIcon className="w-6 h-6" />}
      tooltip={detectedPlane ? `Floor detected (${inlierPercentage}% inliers)` : 'Floor Detection'}
      isActive={detectedPlane !== null}
      panelTitle="Floor Detection"
      disabled={!reconstruction || !wasmReconstruction?.hasPoints()}
    >
      <div className={styles.panelContent}>
        {/* Detect/Clear buttons */}
        <div className={styles.presetGroup}>
          <button
            onClick={handleDetectFloor}
            disabled={isDetecting || !wasmReconstruction?.hasPoints()}
            className={isDetecting ? styles.actionButtonDisabled : styles.actionButtonPrimary}
            data-tooltip="Run RANSAC to detect floor plane"
            data-tooltip-pos="bottom"
          >
            {isDetecting ? 'Detecting...' : 'Detect Floor'}
          </button>
          <button
            onClick={handleClear}
            disabled={!detectedPlane}
            className={detectedPlane ? styles.actionButton : styles.actionButtonDisabled}
            data-tooltip="Clear floor detection"
            data-tooltip-pos="bottom"
          >
            Clear
          </button>
        </div>

        {/* Distance threshold slider */}
        <SliderRow
          label="Threshold"
          value={distanceThreshold}
          min={0.001}
          max={0.5}
          step={0.001}
          onChange={setDistanceThreshold}
          formatValue={(v) => v.toFixed(3)}
        />

        {/* Sample count slider */}
        <SliderRow
          label="Samples"
          value={sampleCount}
          min={1000}
          max={100000}
          step={1000}
          onChange={setSampleCount}
          formatValue={(v) => `${(v / 1000).toFixed(0)}k`}
        />

        {/* Floor color mode */}
        <SelectRow
          label="Color"
          value={floorColorMode}
          onChange={(v) => setFloorColorMode(v as FloorColorMode)}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'binary', label: 'Binary (In/Out)' },
            { value: 'distance', label: 'Distance' },
          ]}
        />

        {/* Status info */}
        {detectedPlane && (
          <div className="text-ds-secondary text-sm mt-3">
            <div className="mb-1 font-medium">Detection Result:</div>
            <div>{inlierPercentage}% inliers ({detectedPlane.inlierCount.toLocaleString()} pts)</div>
            <div className="text-xs text-ds-muted mt-1">
              Left-click widget to flip normal
            </div>
            <div className="text-xs text-ds-muted">
              Right-click widget to cycle axis
            </div>
          </div>
        )}

        {!detectedPlane && (
          <div className="text-ds-secondary text-sm mt-3">
            <div className="mb-1 font-medium">RANSAC Floor Detection:</div>
            <div>Detect dominant plane in</div>
            <div>the point cloud for alignment.</div>
          </div>
        )}
      </div>
    </ControlButton>
  );
});

// Gallery toggle button component
interface GalleryToggleButtonProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
}

const GalleryToggleButton = memo(function GalleryToggleButton({ activePanel, setActivePanel }: GalleryToggleButtonProps) {
  const galleryCollapsed = useUIStore((s) => s.galleryCollapsed);
  const toggleGalleryCollapsed = useUIStore((s) => s.toggleGalleryCollapsed);
  const embedMode = useUIStore((s) => s.embedMode);

  // Hide gallery toggle button in embed mode
  if (embedMode) return null;

  return (
    <ControlButton
      panelId="gallery"
      activePanel={activePanel}
      setActivePanel={setActivePanel}
      icon={
        galleryCollapsed ? <SidebarExpandIcon className="w-6 h-6" /> : <SidebarCollapseIcon className="w-6 h-6" />
      }
      tooltip={galleryCollapsed ? 'Show gallery' : 'Hide gallery'}
      isActive={!galleryCollapsed}
      onClick={toggleGalleryCollapsed}
    />
  );
});

export function ViewerControls() {
  const [activePanel, setActivePanel] = useState<PanelType>(null);

  // Node hooks for reading state
  const pointsNode = usePointsNode();
  const camerasNode = useCamerasNode();
  const selectionNode = useSelectionNode();
  const navNode = useNavigationNode();
  const matchesNode = useMatchesNode();
  const axesNode = useAxesNode();
  const gridNode = useGridNode();
  const rigNode = useRigNode();

  // Action hooks for mutations
  const pointsActions = usePointsNodeActions();
  const camerasActions = useCamerasNodeActions();
  const selectionActions = useSelectionNodeActions();
  const navActions = useNavigationNodeActions();
  const matchesActions = useMatchesNodeActions();
  const axesActions = useAxesNodeActions();
  const gridActions = useGridNodeActions();
  const rigActions = useRigNodeActions();

  // Extract point cloud settings from node
  const showPointCloud = pointsNode.visible;
  const setShowPointCloud = pointsActions.setVisible;
  const togglePointCloud = pointsActions.toggleVisible;
  const pointSize = pointsNode.size;
  const setPointSize = pointsActions.setSize;
  const pointOpacity = pointsNode.opacity;
  const setPointOpacity = pointsActions.setOpacity;
  const colorMode = pointsNode.colorMode;
  const setColorMode = pointsActions.setColorMode;
  const minTrackLength = pointsNode.minTrackLength;
  const setMinTrackLength = pointsActions.setMinTrackLength;
  const maxReprojectionError = pointsNode.maxReprojectionError;
  const setMaxReprojectionError = pointsActions.setMaxReprojectionError;
  const thinning = pointsNode.thinning;
  const setThinning = pointsActions.setThinning;

  // Extract camera display settings from nodes
  const showCameras = camerasNode.visible;
  const setShowCameras = camerasActions.setVisible;
  const cameraDisplayMode = camerasNode.displayMode;
  const setCameraDisplayMode = camerasActions.setDisplayMode;
  const cameraScaleFactor = camerasNode.scaleFactor;
  const setCameraScaleFactor = camerasActions.setScaleFactor;
  const cameraScale = camerasNode.scale;
  const setCameraScale = camerasActions.setScale;
  const frustumColorMode = camerasNode.colorMode;
  const setFrustumColorMode = camerasActions.setColorMode;
  const frustumSingleColor = camerasNode.singleColor;
  const setFrustumSingleColor = camerasActions.setSingleColor;
  const frustumStandbyOpacity = camerasNode.standbyOpacity;
  const setFrustumStandbyOpacity = camerasActions.setStandbyOpacity;
  const undistortionEnabled = camerasNode.undistortionEnabled;
  const setUndistortionEnabled = camerasActions.setUndistortionEnabled;

  // Extract selection settings from node
  const selectionPlaneOpacity = selectionNode.planeOpacity;
  const setSelectionPlaneOpacity = selectionActions.setPlaneOpacity;
  const showSelectionHighlight = selectionNode.visible;
  const setShowSelectionHighlight = selectionActions.setVisible;
  const selectionColorMode = selectionNode.colorMode;
  const setSelectionColorMode = selectionActions.setColorMode;
  const selectionColor = selectionNode.color;
  const setSelectionColor = selectionActions.setColor;
  const selectionAnimationSpeed = selectionNode.animationSpeed;
  const setSelectionAnimationSpeed = selectionActions.setAnimationSpeed;
  const unselectedCameraOpacity = selectionNode.unselectedOpacity;
  const setUnselectedCameraOpacity = selectionActions.setUnselectedOpacity;

  // Extract navigation settings from node
  const cameraMode = navNode.mode;
  const setCameraMode = navActions.setMode;
  const flySpeed = navNode.flySpeed;
  const setFlySpeed = navActions.setFlySpeed;
  const flyTransitionDuration = navNode.flyTransitionDuration;
  const setFlyTransitionDuration = navActions.setFlyTransitionDuration;
  const pointerLock = navNode.pointerLock;
  const setPointerLock = navActions.setPointerLock;
  const cameraProjection = navNode.projection;
  const setCameraProjection = navActions.setProjection;
  const cameraFov = navNode.fov;
  const setCameraFov = navActions.setFov;
  const horizonLock = navNode.horizonLock;
  const setHorizonLock = navActions.setHorizonLock;
  const autoRotateMode = navNode.autoRotateMode;
  const setAutoRotateMode = navActions.setAutoRotateMode;
  const autoRotateSpeed = navNode.autoRotateSpeed;
  const setAutoRotateSpeed = navActions.setAutoRotateSpeed;
  const autoFovEnabled = navNode.autoFovEnabled;
  const setAutoFovEnabled = navActions.setAutoFovEnabled;

  // Extract matches settings from node
  const showMatches = matchesNode.visible;
  const setShowMatches = matchesActions.setVisible;
  const matchesDisplayMode = matchesNode.displayMode;
  const setMatchesDisplayMode = matchesActions.setDisplayMode;
  const matchesOpacity = matchesNode.opacity;
  const setMatchesOpacity = matchesActions.setOpacity;
  const matchesColor = matchesNode.color;
  const setMatchesColor = matchesActions.setColor;

  // Extract axes settings from node
  const showAxes = axesNode.visible;
  const setShowAxes = axesActions.setVisible;
  const toggleAxes = axesActions.toggleVisible;
  const axesCoordinateSystem = axesNode.coordinateSystem;
  const setAxesCoordinateSystem = axesActions.setCoordinateSystem;
  const axesScale = axesNode.scale;
  const setAxesScale = axesActions.setScale;
  const axisLabelMode = axesNode.labelMode;
  const setAxisLabelMode = axesActions.setLabelMode;

  // Extract grid settings from node
  const showGrid = gridNode.visible;
  const setShowGrid = gridActions.setVisible;
  const toggleGrid = gridActions.toggleVisible;
  const gridScale = gridNode.scale;
  const setGridScale = gridActions.setScale;

  // UI settings (remaining from UIStore)
  const backgroundColor = useUIStore((s) => s.backgroundColor);
  const setBackgroundColor = useUIStore((s) => s.setBackgroundColor);
  const setView = useUIStore((s) => s.setView);
  const openContextMenuEditor = useUIStore((s) => s.openContextMenuEditor);


  // Reconstruction data (needed for various panels)
  const reconstruction = useReconstructionStore((s) => s.reconstruction);

  // Extract rig settings from node
  const showRig = rigNode.visible;
  const setShowRig = rigActions.setVisible;
  const rigDisplayMode = rigNode.displayMode;
  const setRigDisplayMode = rigActions.setDisplayMode;
  const rigColorMode = rigNode.colorMode;
  const setRigColorMode = rigActions.setColorMode;
  const rigLineColor = rigNode.color;
  const setRigLineColor = rigActions.setColor;
  const rigLineOpacity = rigNode.opacity;
  const setRigLineOpacity = rigActions.setOpacity;
  // Compute rig info from image names (images with same filename in different directories form a rig group)
  const rigInfo = useMemo(() => {
    if (!reconstruction) return { hasRigData: false, cameraCount: 0, frameCount: 0 };

    // Group images by frame identifier (filename without directory)
    const frameGroups = new Map<string, number>();
    for (const image of reconstruction.images.values()) {
      const parts = image.name.split(/[/\\]/);
      const frameId = parts.length >= 2 ? parts[parts.length - 1] : image.name;
      frameGroups.set(frameId, (frameGroups.get(frameId) ?? 0) + 1);
    }

    // Count frames with multiple cameras
    let multiCameraFrames = 0;
    let maxCameras = 0;
    for (const count of frameGroups.values()) {
      if (count >= 2) {
        multiCameraFrames++;
        maxCameras = Math.max(maxCameras, count);
      }
    }

    return {
      hasRigData: multiCameraFrames > 0,
      cameraCount: maxCameras,
      frameCount: multiCameraFrames,
    };
  }, [reconstruction]);

  const { hasRigData, cameraCount, frameCount } = rigInfo;

  // Track HSL values in local state so they persist even when they don't affect the hex color
  const [hsl, setHsl] = useState(() => hexToHsl(backgroundColor));

  // Sync local HSL state when backgroundColor changes externally
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional pattern for syncing derived state with external changes
    setHsl((currentHsl) => {
      // Only update if the color actually changed (not just from our own updates)
      if (hslToHex(currentHsl.h, currentHsl.s, currentHsl.l) !== backgroundColor) {
        return hexToHsl(backgroundColor);
      }
      return currentHsl;
    });
  }, [backgroundColor]);

  // Update both local state and store
  const updateHsl = useCallback((newHsl: { h: number; s: number; l: number }) => {
    setHsl(newHsl);
    setBackgroundColor(hslToHex(newHsl.h, newHsl.s, newHsl.l));
  }, [setBackgroundColor]);

  const toggleBackground = useCallback(() => {
    const newL = hsl.l < 50 ? 100 : 0;
    updateHsl({ h: 0, s: 0, l: newL });
  }, [hsl.l, updateHsl]);

  const handleHueChange = useCallback((h: number) => {
    updateHsl({ ...hsl, h });
  }, [hsl, updateHsl]);

  const handleSaturationChange = useCallback((s: number) => {
    updateHsl({ ...hsl, s });
  }, [hsl, updateHsl]);

  const handleLightnessChange = useCallback((l: number) => {
    updateHsl({ ...hsl, l });
  }, [hsl, updateHsl]);

  const handleColorPickerChange = useCallback((hex: string) => {
    updateHsl(hexToHsl(hex));
  }, [updateHsl]);

  // Track HSL values for frustum single color
  const [frustumHsl, setFrustumHsl] = useState(() => hexToHsl(frustumSingleColor));

  // Sync frustum HSL state when frustumSingleColor changes externally
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional pattern for syncing derived state with external changes
    setFrustumHsl((currentHsl) => {
      if (hslToHex(currentHsl.h, currentHsl.s, currentHsl.l) !== frustumSingleColor) {
        return hexToHsl(frustumSingleColor);
      }
      return currentHsl;
    });
  }, [frustumSingleColor]);

  const updateFrustumHsl = useCallback((newHsl: { h: number; s: number; l: number }) => {
    setFrustumHsl(newHsl);
    setFrustumSingleColor(hslToHex(newHsl.h, newHsl.s, newHsl.l));
  }, [setFrustumSingleColor]);

  const handleFrustumHueChange = useCallback((h: number) => {
    updateFrustumHsl({ ...frustumHsl, h });
  }, [frustumHsl, updateFrustumHsl]);

  const handleFrustumSaturationChange = useCallback((s: number) => {
    updateFrustumHsl({ ...frustumHsl, s });
  }, [frustumHsl, updateFrustumHsl]);

  const handleFrustumLightnessChange = useCallback((l: number) => {
    updateFrustumHsl({ ...frustumHsl, l });
  }, [frustumHsl, updateFrustumHsl]);

  const handleFrustumColorPickerChange = useCallback((hex: string) => {
    updateFrustumHsl(hexToHsl(hex));
  }, [updateFrustumHsl]);

  const toggleCameraMode = useCallback(() => {
    setCameraMode(cameraMode === 'orbit' ? 'fly' : 'orbit');
  }, [cameraMode, setCameraMode]);

  const toggleUndistortion = useCallback(() => {
    setUndistortionEnabled(!undistortionEnabled);
  }, [undistortionEnabled, setUndistortionEnabled]);

  // Cycle through color modes: rgb → error → trackLength → off → rgb
  const cycleColorMode = useCallback(() => {
    if (!showPointCloud) {
      // off → rgb
      setShowPointCloud(true);
      setColorMode('rgb');
    } else if (colorMode === 'rgb') {
      // rgb → error
      setColorMode('error');
    } else if (colorMode === 'error') {
      // error → trackLength
      setColorMode('trackLength');
    } else {
      // trackLength → off
      setShowPointCloud(false);
    }
  }, [showPointCloud, colorMode, setShowPointCloud, setColorMode]);

  // Cycle through camera display modes: off → frustum → arrow → imageplane → off
  // Uses showCameras for off state, cameraDisplayMode for the display type
  const cycleCameraDisplayMode = useCallback(() => {
    if (!showCameras) {
      // off → frustum
      setShowCameras(true);
      setCameraDisplayMode('frustum');
    } else if (cameraDisplayMode === 'frustum') {
      // frustum → arrow
      setCameraDisplayMode('arrow');
    } else if (cameraDisplayMode === 'arrow') {
      // arrow → imageplane
      setCameraDisplayMode('imageplane');
    } else {
      // imageplane → off
      setShowCameras(false);
    }
  }, [showCameras, cameraDisplayMode, setShowCameras, setCameraDisplayMode]);

  // Cycle through matches display modes: off → static → blink → off
  const cycleMatchesDisplayMode = useCallback(() => {
    if (!showMatches) {
      // off → static
      setShowMatches(true);
      setMatchesDisplayMode('static');
    } else if (matchesDisplayMode === 'static') {
      // static → blink
      setMatchesDisplayMode('blink');
    } else {
      // blink → off
      setShowMatches(false);
    }
  }, [showMatches, matchesDisplayMode, setShowMatches, setMatchesDisplayMode]);

  // Cycle through selection color modes: off → static → blink → rainbow → off
  const cycleSelectionColorMode = useCallback(() => {
    if (!showSelectionHighlight) {
      setShowSelectionHighlight(true);
      setSelectionColorMode('static');
    } else if (selectionColorMode === 'static') {
      setSelectionColorMode('blink');
    } else if (selectionColorMode === 'blink') {
      setSelectionColorMode('rainbow');
    } else {
      setShowSelectionHighlight(false);
    }
  }, [showSelectionHighlight, selectionColorMode, setShowSelectionHighlight, setSelectionColorMode]);


  // Cycle through rig display modes: off → static → blink → off
  const cycleRigDisplayMode = useCallback(() => {
    if (!showRig) {
      // off → static
      setShowRig(true);
      setRigDisplayMode('static');
    } else if (rigDisplayMode === 'static') {
      // static → blink
      setRigDisplayMode('blink');
    } else {
      // blink → off
      setShowRig(false);
    }
  }, [showRig, rigDisplayMode, setShowRig, setRigDisplayMode]);

  // Reset view including projection
  const handleResetView = useCallback(() => {
    setView('reset');
    setCameraProjection('perspective');
  }, [setView, setCameraProjection]);

  // Hotkey for reset view
  useHotkeys(
    HOTKEYS.resetView.keys,
    handleResetView,
    { scopes: HOTKEYS.resetView.scopes },
    [handleResetView]
  );

  // Hotkeys for axis views
  useHotkeys(
    HOTKEYS.viewX.keys,
    () => setView('x'),
    { scopes: HOTKEYS.viewX.scopes },
    [setView]
  );
  useHotkeys(
    HOTKEYS.viewY.keys,
    () => setView('y'),
    { scopes: HOTKEYS.viewY.scopes },
    [setView]
  );
  useHotkeys(
    HOTKEYS.viewZ.keys,
    () => setView('z'),
    { scopes: HOTKEYS.viewZ.scopes },
    [setView]
  );
  useHotkeys(
    HOTKEYS.viewNegX.keys,
    () => setView('-x'),
    { scopes: HOTKEYS.viewNegX.scopes },
    [setView]
  );
  useHotkeys(
    HOTKEYS.viewNegY.keys,
    () => setView('-y'),
    { scopes: HOTKEYS.viewNegY.scopes },
    [setView]
  );
  useHotkeys(
    HOTKEYS.viewNegZ.keys,
    () => setView('-z'),
    { scopes: HOTKEYS.viewNegZ.scopes },
    [setView]
  );

  // Hotkey for cycling axes & grid states (G)
  // Cycle: both on → axes only → grid only → both off → both on
  const cycleAxesGrid = useCallback(() => {
    if (showAxes && showGrid) {
      // both on → axes only
      setShowGrid(false);
    } else if (showAxes && !showGrid) {
      // axes only → grid only
      setShowAxes(false);
      setShowGrid(true);
    } else if (!showAxes && showGrid) {
      // grid only → both off
      setShowGrid(false);
    } else {
      // both off → both on
      setShowAxes(true);
      setShowGrid(true);
    }
  }, [showAxes, showGrid, setShowAxes, setShowGrid]);

  useHotkeys(
    HOTKEYS.toggleGrid.keys,
    cycleAxesGrid,
    { scopes: HOTKEYS.toggleGrid.scopes },
    [cycleAxesGrid]
  );

  // Hotkey for toggling camera mode
  useHotkeys(
    HOTKEYS.toggleCameraMode.keys,
    toggleCameraMode,
    { scopes: HOTKEYS.toggleCameraMode.scopes },
    [toggleCameraMode]
  );

  // Hotkey for toggling background
  useHotkeys(
    HOTKEYS.toggleBackground.keys,
    toggleBackground,
    { scopes: HOTKEYS.toggleBackground.scopes },
    [toggleBackground]
  );

  // Hotkey for Point Cloud (P) - cycles color mode
  useHotkeys(
    HOTKEYS.cyclePointSize.keys,
    cycleColorMode,
    { scopes: HOTKEYS.cyclePointSize.scopes },
    [cycleColorMode]
  );

  // Hotkey for cycling camera display
  useHotkeys(
    HOTKEYS.cycleCameraDisplay.keys,
    cycleCameraDisplayMode,
    { scopes: HOTKEYS.cycleCameraDisplay.scopes },
    [cycleCameraDisplayMode]
  );

  // Hotkey for cycling matches display
  useHotkeys(
    HOTKEYS.cycleMatchesDisplay.keys,
    cycleMatchesDisplayMode,
    { scopes: HOTKEYS.cycleMatchesDisplay.scopes },
    [cycleMatchesDisplayMode]
  );

  // Hotkey for toggling undistortion
  useHotkeys(
    HOTKEYS.toggleUndistortion.keys,
    toggleUndistortion,
    { scopes: HOTKEYS.toggleUndistortion.scopes },
    [toggleUndistortion]
  );

  // Hotkey for showing random COLMAP joke (easter egg)
  const showRandomJoke = useCallback(() => {
    const joke = COLMAP_JOKES[Math.floor(Math.random() * COLMAP_JOKES.length)];
    useNotificationStore.getState().addNotification('info', joke, 4000);
  }, []);

  const showRandomJokePersistent = useCallback(() => {
    const joke = COLMAP_JOKES[Math.floor(Math.random() * COLMAP_JOKES.length)];
    useNotificationStore.getState().addNotification('warning', joke);
  }, []);

  useHotkeys(
    HOTKEYS.showJoke.keys,
    showRandomJoke,
    { scopes: HOTKEYS.showJoke.scopes, preventDefault: true },
    [showRandomJoke]
  );

  useHotkeys(
    HOTKEYS.showJokePersistent.keys,
    showRandomJokePersistent,
    { scopes: HOTKEYS.showJokePersistent.scopes, preventDefault: true },
    [showRandomJokePersistent]
  );

  // Hotkey for resetting guide tips
  const resetGuide = useCallback(() => {
    useGuideStore.getState().resetGuide();
    useNotificationStore.getState().addNotification('info', 'Guide tips reset', 3000);
  }, []);

  useHotkeys(
    HOTKEYS.resetGuide.keys,
    resetGuide,
    { scopes: HOTKEYS.resetGuide.scopes, preventDefault: true },
    [resetGuide]
  );

  // Point picking - get reset function for escape hotkey
  const resetPicking = usePointPickingStore((s) => s.reset);
  const pickingModeActive = usePointPickingStore((s) => s.pickingMode) !== 'off';

  // Hotkey for canceling point picking (Escape)
  useHotkeys(
    'escape',
    resetPicking,
    { enabled: pickingModeActive },
    [resetPicking, pickingModeActive]
  );

  return (
    <div className={styles.container} data-testid="viewer-controls">
      <ControlButton
        panelId="view"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={<ViewIcon className="w-6 h-6" />}
        tooltip="View options (R)"
        onClick={handleResetView}
        panelTitle="View"
      >
        <div className={styles.panelContent}>
          {/* Projection toggle */}
          <div className="flex gap-1 mb-3">
            <button
              onClick={() => setCameraProjection('perspective')}
              className={cameraProjection === 'perspective' ? styles.actionButtonPrimary : styles.actionButton}
              style={{ flex: 1 }}
            >
              Persp
            </button>
            <button
              onClick={() => setCameraProjection('orthographic')}
              className={cameraProjection === 'orthographic' ? styles.actionButtonPrimary : styles.actionButton}
              style={{ flex: 1 }}
            >
              Ortho
            </button>
          </div>

          {/* FOV slider - only for perspective */}
          {cameraProjection === 'perspective' && (
            <SliderRow
              label="FOV"
              value={cameraFov}
              min={10}
              max={120}
              step={0.1}
              onChange={setCameraFov}
              formatValue={(v) => `${v.toFixed(1)}°`}
            />
          )}

          <div className="flex gap-1 mb-1">
            <button
              onClick={() => setView('x')}
              className={styles.actionButton}
              style={{ flex: 1 }}
            >
              +X <span className="text-ds-muted text-xs">(1)</span>
            </button>
            <button
              onClick={() => setView('y')}
              className={styles.actionButton}
              style={{ flex: 1 }}
            >
              +Y <span className="text-ds-muted text-xs">(2)</span>
            </button>
            <button
              onClick={() => setView('z')}
              className={styles.actionButton}
              style={{ flex: 1 }}
            >
              +Z <span className="text-ds-muted text-xs">(3)</span>
            </button>
          </div>
          <div className="flex gap-1 mb-3">
            <button
              onClick={() => setView('-x')}
              className={styles.actionButton}
              style={{ flex: 1 }}
            >
              -X <span className="text-ds-muted text-xs">(4)</span>
            </button>
            <button
              onClick={() => setView('-y')}
              className={styles.actionButton}
              style={{ flex: 1 }}
            >
              -Y <span className="text-ds-muted text-xs">(5)</span>
            </button>
            <button
              onClick={() => setView('-z')}
              className={styles.actionButton}
              style={{ flex: 1 }}
            >
              -Z <span className="text-ds-muted text-xs">(6)</span>
            </button>
          </div>
          <div className={styles.actionGroup}>
            <button
              onClick={handleResetView}
              className={styles.actionButtonPrimary}
              style={{ flex: 1 }}
            >
              Reset View
              <span className="text-ds-void/70 ml-2 text-xs">(R)</span>
            </button>
          </div>
        </div>
      </ControlButton>

      <ControlButton
        panelId="axes"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={
          <HoverIcon
            icon={
              showAxes && showGrid ? <AxesGridIcon className="w-6 h-6" /> :
              showAxes ? <AxesIcon className="w-6 h-6" /> :
              showGrid ? <GridIcon className="w-6 h-6" /> :
              <AxesOffIcon className="w-6 h-6" />
            }
            label={showAxes && showGrid ? 'A+G' : showAxes ? 'AXS' : showGrid ? 'GRD' : 'OFF'}
          />
        }
        tooltip="Axes & Grid (G)"
        isActive={showAxes || showGrid}
        panelTitle="Axes & Grid (G)"
      >
        <div className={styles.panelContent}>
          <ToggleRow label="Show Axes" checked={showAxes} onChange={toggleAxes} />
          <ToggleRow label="Show Grid" checked={showGrid} onChange={toggleGrid} />
          <SelectRow
            label="System"
            value={axesCoordinateSystem}
            onChange={(v) => setAxesCoordinateSystem(v as AxesCoordinateSystem)}
            options={[
              { value: 'colmap', label: 'COLMAP' },
              { value: 'opencv', label: 'OpenCV' },
              { value: 'threejs', label: 'Three.js' },
              { value: 'opengl', label: 'OpenGL' },
              { value: 'vulkan', label: 'Vulkan' },
              { value: 'blender', label: 'Blender' },
              { value: 'houdini', label: 'Houdini' },
              { value: 'unity', label: 'Unity' },
              { value: 'unreal', label: 'Unreal' },
            ]}
          />
          <SelectRow
            label="Labels"
            value={axisLabelMode}
            onChange={(v) => setAxisLabelMode(v as AxisLabelMode)}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'xyz', label: 'XYZ' },
              { value: 'extra', label: 'Extra' },
            ]}
          />
          <SliderRow
            label="Axes Scale"
            value={Math.log10(axesScale)}
            min={-3}
            max={3}
            step={0.1}
            onChange={(v) => setAxesScale(Math.pow(10, v))}
            formatValue={(v) => `10${toSuperscript(v)}`}
          />
          <SliderRow
            label="Grid Scale"
            value={Math.log10(gridScale)}
            min={-3}
            max={3}
            step={0.1}
            onChange={(v) => setGridScale(Math.pow(10, v))}
            formatValue={(v) => `10${toSuperscript(v)}`}
          />
        </div>
      </ControlButton>

      <ControlButton
        panelId="camera"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={
          <HoverIcon
            icon={cameraMode === 'orbit' ? <OrbitIcon className="w-6 h-6" /> : <FlyIcon className="w-6 h-6" />}
            label={cameraMode === 'orbit' ? 'ORB' : 'FLY'}
          />
        }
        tooltip={cameraMode === 'orbit' ? 'Orbit mode (C)' : 'Fly mode (C)'}
        onClick={toggleCameraMode}
        panelTitle="Camera Mode (C)"
      >
        <div className={styles.panelContent}>
          <SelectRow
            label="Mode"
            value={cameraMode}
            onChange={(v) => setCameraMode(v as CameraMode)}
            options={[
              { value: 'orbit', label: 'Orbit' },
              { value: 'fly', label: 'Fly' },
            ]}
          />
          <SliderRow label="Speed" value={flySpeed} min={0.1} max={5} step={0.1} onChange={setFlySpeed} formatValue={(v) => v.toFixed(1)} />
          <SliderRow
            label="Goto Anim"
            value={flyTransitionDuration}
            min={0}
            max={2000}
            step={100}
            onChange={setFlyTransitionDuration}
            formatValue={(v) => v === 0 ? 'Off' : `${(v / 1000).toFixed(1)}s`}
          />
          <div className={styles.row}>
            <label className={styles.label}>Pointer Lock</label>
            <span className="flex-1" />
            <ToggleSwitch
              checked={pointerLock}
              onChange={setPointerLock}
            />
          </div>
          <SelectRow
            label="Horizon Lock"
            value={horizonLock}
            onChange={(v) => setHorizonLock(v as HorizonLockMode)}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'on', label: 'On' },
              { value: 'flip', label: 'Flip' },
            ]}
          />
          {cameraMode === 'orbit' && (
            <>
              <SelectRow
                label="Auto Rotate"
                value={autoRotateMode}
                onChange={(v) => setAutoRotateMode(v as AutoRotateMode)}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'cw', label: 'Clockwise' },
                  { value: 'ccw', label: 'Counter-CW' },
                ]}
              />
              <SliderRow
                label="Rotate Speed"
                value={autoRotateSpeed}
                min={0.1}
                max={2}
                step={0.1}
                onChange={setAutoRotateSpeed}
                formatValue={(v) => v.toFixed(1)}
              />
            </>
          )}
          <div className="text-ds-secondary text-sm mt-3">
            <div className="mb-1 font-medium">Mouse:</div>
            {cameraMode === 'orbit' ? (
              <>
                <div>Left drag: Rotate</div>
                <div>Right/Mid drag: Pan</div>
                <div>Scroll: Zoom</div>
              </>
            ) : (
              <>
                <div>Left drag: Look around</div>
                <div>Right/Mid drag: Strafe</div>
                <div>Scroll: Move fwd/back</div>
                <div>Shift+drag: Faster</div>
              </>
            )}
            <div className="mt-2 font-medium">Keyboard:</div>
            <div>WASD: Move</div>
            <div>Q: Down, E/Space: Up</div>
            <div>Shift: Speed boost</div>
            <div className="mt-2 font-medium">Modifiers:</div>
            <div>Alt+Scroll: Camera size</div>
            <div>Ctrl+Scroll: Point size</div>
          </div>
        </div>
      </ControlButton>

      <ControlButton
        panelId="bg"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={<BgIcon className="w-6 h-6" />}
        tooltip="Background color (B)"
        onClick={toggleBackground}
        panelTitle="Background Color (B)"
      >
        <div className={styles.panelContent}>
          <ColorPickerRow
            label="Color"
            value={backgroundColor}
            onChange={handleColorPickerChange}
          />
          <HueSliderRow
            label="Hue"
            value={hsl.h}
            onChange={handleHueChange}
          />
          <SliderRow
            label="Saturation"
            value={hsl.s}
            min={0}
            max={100}
            step={1}
            onChange={handleSaturationChange}
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <SliderRow
            label="Lightness"
            value={hsl.l}
            min={0}
            max={100}
            step={1}
            onChange={handleLightnessChange}
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </ControlButton>

      <TransformPanel styles={styles} activePanel={activePanel} setActivePanel={setActivePanel} />

      <FloorDetectionPanel styles={styles} activePanel={activePanel} setActivePanel={setActivePanel} />

      <ControlButton
        panelId="points"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={
          <HoverIcon
            icon={
              !showPointCloud ? <ColorOffIcon className="w-6 h-6" /> :
              colorMode === 'rgb' ? <ColorRgbIcon className="w-6 h-6" /> :
              colorMode === 'error' ? <ColorErrorIcon className="w-6 h-6" /> :
              <ColorTrackIcon className="w-6 h-6" />
            }
            label={!showPointCloud ? 'OFF' : colorMode === 'rgb' ? 'RGB' : colorMode === 'error' ? 'ERR' : 'TRK'}
          />
        }
        tooltip={
          !showPointCloud ? 'Point Cloud: Off (P)' :
          colorMode === 'rgb' ? 'Point Cloud: RGB (P)' :
          colorMode === 'error' ? 'Point Cloud: Error (P)' :
          'Point Cloud: Track (P)'
        }
        isActive={showPointCloud}
        onClick={cycleColorMode}
        panelTitle="Point Cloud (P)"
      >
        <div className={styles.panelContent}>
          <ToggleRow label="Show Points" checked={showPointCloud} onChange={togglePointCloud} />
          <SelectRow
            label="Color"
            value={colorMode}
            onChange={(v) => setColorMode(v as ColorMode)}
            options={[
              { value: 'rgb', label: 'RGB' },
              { value: 'error', label: 'Error' },
              { value: 'trackLength', label: 'Track Length' },
            ]}
          />
          <SliderRow label={<>Size <span className="text-ds-muted text-xs inline-flex items-center gap-0.5">(Ctrl+<MouseScrollIcon className="w-3 h-3 inline" />)</span></>} value={pointSize} min={1} max={10} step={0.5} onChange={setPointSize} />
          <SliderRow label="Opacity" value={pointOpacity} min={0} max={1} step={0.05} onChange={setPointOpacity} formatValue={(v) => `${Math.round(v * 100)}%`} />
          <SliderRow label="Min Track" value={minTrackLength} min={0} max={20} step={1} onChange={(v) => setMinTrackLength(Math.round(v))} />
          <SliderRow label="Thinning" value={thinning} min={0} max={99} step={1} onChange={(v) => setThinning(Math.round(v))} />
          <SliderRow
            label="Max Error"
            value={maxReprojectionError === null ? (reconstruction?.globalStats.maxError ?? 10) : maxReprojectionError}
            min={0}
            max={reconstruction?.globalStats.maxError ?? 10}
            step={0.1}
            onChange={(v) => setMaxReprojectionError(v >= (reconstruction?.globalStats.maxError ?? 10) ? null : v)}
            formatValue={(v) => maxReprojectionError === null ? '∞' : v.toFixed(1)}
          />


          <div className="text-ds-secondary text-sm mt-3">
            {colorMode === 'rgb' ? (
              <>
                <div className="mb-1 font-medium">RGB Colors:</div>
                <div>Original point colors from</div>
                <div>the reconstruction.</div>
              </>
            ) : colorMode === 'error' ? (
              <>
                <div className="mb-1 font-medium">Reprojection Error:</div>
                <div>Blue = low error (accurate)</div>
                <div>Red = high error (outliers)</div>
              </>
            ) : (
              <>
                <div className="mb-1 font-medium">Track Length:</div>
                <div>Dark = few observations</div>
                <div>Bright = many observations</div>
              </>
            )}
          </div>
        </div>
      </ControlButton>

      <ControlButton
        panelId="scale"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={
          <HoverIcon
            icon={
              !showCameras ? <CameraOffIcon className="w-6 h-6" /> :
              cameraDisplayMode === 'frustum' ? <FrustumIcon className="w-6 h-6" /> :
              cameraDisplayMode === 'arrow' ? <ArrowIcon className="w-6 h-6" /> :
              <ImageIcon className="w-6 h-6" />
            }
            label={!showCameras ? 'OFF' : cameraDisplayMode === 'frustum' ? 'FRM' : cameraDisplayMode === 'arrow' ? 'ARW' : 'IMG'}
          />
        }
        tooltip={
          !showCameras ? 'Cameras hidden (F)' :
          cameraDisplayMode === 'frustum' ? 'Frustum mode (F)' :
          cameraDisplayMode === 'arrow' ? 'Arrow mode (F)' :
          'Image plane mode (F)'
        }
        isActive={showCameras}
        onClick={cycleCameraDisplayMode}
        panelTitle="Camera Display (F)"
      >
        <div className={styles.panelContent}>
          <ToggleRow label="Show Cameras" checked={showCameras} onChange={setShowCameras} />
          <SelectRow
            label="Mode"
            value={cameraDisplayMode}
            onChange={(v) => setCameraDisplayMode(v as CameraDisplayMode)}
            options={[
              { value: 'frustum', label: 'Frustum' },
              { value: 'arrow', label: 'Arrow' },
              { value: 'imageplane', label: 'Image Plane' },
            ]}
          />
          {showCameras && (
            <>
              <SelectRow
                label="Color"
                value={frustumColorMode}
                onChange={(v) => setFrustumColorMode(v as FrustumColorMode)}
                options={[
                  { value: 'single', label: 'Single' },
                  { value: 'byCamera', label: 'By Cam' },
                  ...(hasRigData ? [{ value: 'byRigFrame', label: 'By Frame' }] : []),
                ]}
              />
              {frustumColorMode === 'single' && (
                <>
                  <ColorPickerRow
                    label="Frustum"
                    value={frustumSingleColor}
                    onChange={handleFrustumColorPickerChange}
                  />
                  <HueSliderRow
                    label="Hue"
                    value={frustumHsl.h}
                    onChange={handleFrustumHueChange}
                  />
                  <SliderRow
                    label="Saturation"
                    value={frustumHsl.s}
                    min={0}
                    max={100}
                    step={1}
                    onChange={handleFrustumSaturationChange}
                    formatValue={(v) => `${Math.round(v)}%`}
                  />
                  <SliderRow
                    label="Lightness"
                    value={frustumHsl.l}
                    min={0}
                    max={100}
                    step={1}
                    onChange={handleFrustumLightnessChange}
                    formatValue={(v) => `${Math.round(v)}%`}
                  />
                </>
              )}
              <SelectRow
                label="Scale ×"
                value={cameraScaleFactor}
                onChange={(v) => setCameraScaleFactor(v as CameraScaleFactor)}
                options={[
                  { value: '0.1', label: '0.1×' },
                  { value: '1', label: '1×' },
                  { value: '10', label: '10×' },
                ]}
              />
              <SliderRow label={<>Scale <span className="text-ds-muted text-xs inline-flex items-center gap-0.5">(Alt+<MouseScrollIcon className="w-3 h-3 inline" />)</span></>} value={cameraScale} min={0.05} max={1} step={0.05} onChange={setCameraScale} formatValue={(v) => v.toFixed(2)} />
              <SliderRow
                label="Standby α"
                value={frustumStandbyOpacity}
                min={0}
                max={1}
                step={0.05}
                onChange={setFrustumStandbyOpacity}
                formatValue={(v) => v.toFixed(2)}
              />
              <SliderRow
                label="Selection α"
                value={selectionPlaneOpacity}
                min={0}
                max={1}
                step={0.05}
                onChange={setSelectionPlaneOpacity}
                formatValue={(v) => v.toFixed(2)}
              />
              <SliderRow
                label="Unselected α"
                value={unselectedCameraOpacity}
                min={0}
                max={1}
                step={0.05}
                onChange={setUnselectedCameraOpacity}
                formatValue={(v) => v.toFixed(2)}
              />
              <div className={styles.row}>
                <label className={styles.label}>Undistort (U)</label>
                <span className="flex-1" />
                <ToggleSwitch
                  checked={undistortionEnabled}
                  onChange={setUndistortionEnabled}
                />
              </div>
              <div className={styles.row}>
                <label className={styles.label}>Auto FOV</label>
                <span className="flex-1" />
                <ToggleSwitch
                  checked={autoFovEnabled}
                  onChange={setAutoFovEnabled}
                />
              </div>
            </>
          )}
          <div className="text-ds-secondary text-sm mt-3">
            {cameraDisplayMode === 'frustum' ? (
              <>
                <div className="mb-1 font-medium">Frustum:</div>
                <div>Full camera frustum</div>
                <div>pyramid wireframes.</div>
              </>
            ) : cameraDisplayMode === 'arrow' ? (
              <>
                <div className="mb-1 font-medium">Arrow:</div>
                <div>Simple arrow showing</div>
                <div>camera look direction.</div>
              </>
            ) : (
              <>
                <div className="mb-1 font-medium">Image Plane:</div>
                <div>Shows image textures</div>
                <div>on camera planes.</div>
              </>
            )}
          </div>
        </div>
      </ControlButton>

      {showCameras && (
        <>
          {cameraDisplayMode !== 'imageplane' && (
            <ControlButton
            panelId="matches"
            activePanel={activePanel}
            setActivePanel={setActivePanel}
            icon={
              !showMatches ? <MatchOffIcon className="w-6 h-6" /> :
              matchesDisplayMode === 'static' ? <MatchOnIcon className="w-6 h-6" /> :
              <MatchBlinkIcon className="w-6 h-6" />
            }
            tooltip={
              !showMatches ? 'Matches off (M)' :
              matchesDisplayMode === 'static' ? 'Matches static (M)' :
              'Matches blink (M)'
            }
            isActive={showMatches}
            onClick={cycleMatchesDisplayMode}
            panelTitle="Show Matches (M)"
          >
            <div className={styles.panelContent}>
              <ToggleRow label="Show Matches" checked={showMatches} onChange={setShowMatches} />
              {showMatches && (
                <SelectRow
                  label="Mode"
                  value={matchesDisplayMode}
                  onChange={(v) => setMatchesDisplayMode(v as MatchesDisplayMode)}
                  options={[
                    { value: 'static', label: 'Static' },
                    { value: 'blink', label: 'Blink' },
                  ]}
                />
              )}
              {showMatches && (
                <>
                  <SliderRow label="Opacity" value={matchesOpacity} min={0.5} max={1} step={0.05} onChange={setMatchesOpacity} formatValue={(v) => v.toFixed(2)} />
                  <HueRow label="Color" value={matchesColor} onChange={setMatchesColor} />
                </>
              )}
              <div className="text-ds-secondary text-sm mt-3">
                {!showMatches ? (
                  <>
                    <div className="mb-1 font-medium">Off:</div>
                    <div>Match lines hidden.</div>
                  </>
                ) : matchesDisplayMode === 'static' ? (
                  <>
                    <div className="mb-1 font-medium">Static:</div>
                    <div>Show match lines between</div>
                    <div>selected camera and points.</div>
                  </>
                ) : (
                  <>
                    <div className="mb-1 font-medium">Blink:</div>
                    <div>Match lines animate with</div>
                    <div>blinking effect.</div>
                  </>
                )}
              </div>
            </div>
          </ControlButton>
          )}

          <ControlButton
            panelId="selectionColor"
            activePanel={activePanel}
            setActivePanel={setActivePanel}
            icon={
              !showSelectionHighlight ? <SelectionOffIcon className="w-6 h-6" /> :
              selectionColorMode === 'static' ? <SelectionStaticIcon className="w-6 h-6" /> :
              selectionColorMode === 'blink' ? <SelectionBlinkIcon className="w-6 h-6" /> :
              <RainbowIcon className="w-6 h-6" />
            }
            tooltip={
              !showSelectionHighlight ? 'Selection off' :
              selectionColorMode === 'static' ? 'Static color' :
              selectionColorMode === 'blink' ? 'Blink' : 'Rainbow'
            }
            isActive={showSelectionHighlight}
            onClick={cycleSelectionColorMode}
            panelTitle="Selection Highlight"
          >
            <div className={styles.panelContent}>
              <ToggleRow
                label="Show Highlight"
                checked={showSelectionHighlight}
                onChange={setShowSelectionHighlight}
              />
              {showSelectionHighlight && (
                <>
                  <SelectRow
                    label="Mode"
                    value={selectionColorMode}
                    onChange={(v) => setSelectionColorMode(v as SelectionColorMode)}
                    options={[
                      { value: 'static', label: 'Static' },
                      { value: 'blink', label: 'Blink' },
                      { value: 'rainbow', label: 'Rainbow' },
                    ]}
                  />
                  {(selectionColorMode === 'static' || selectionColorMode === 'blink') && (
                    <HueRow label="Color" value={selectionColor} onChange={setSelectionColor} />
                  )}
                  {(selectionColorMode === 'blink' || selectionColorMode === 'rainbow') && (
                    <SliderRow label="Speed" value={selectionAnimationSpeed} min={0.1} max={5} step={0.1} onChange={setSelectionAnimationSpeed} formatValue={(v) => v.toFixed(1)} />
                  )}
                </>
              )}
              <div className="text-ds-secondary text-sm mt-3">
                {selectionColorMode === 'static' ? (
                  <>
                    <div className="mb-1 font-medium">Static:</div>
                    <div>Solid color highlight</div>
                    <div>for selected camera.</div>
                  </>
                ) : selectionColorMode === 'blink' ? (
                  <>
                    <div className="mb-1 font-medium">Blink:</div>
                    <div>Selected camera pulses</div>
                    <div>to draw attention.</div>
                  </>
                ) : (
                  <>
                    <div className="mb-1 font-medium">Rainbow:</div>
                    <div>Selected camera cycles</div>
                    <div>through all colors.</div>
                  </>
                )}
              </div>
            </div>
          </ControlButton>
        </>
      )}

      {/* Rig panel - disabled when no rig data is loaded */}
      <ControlButton
        panelId="rig"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={
          <HoverIcon
            icon={!showRig || !hasRigData ? <RigOffIcon className="w-6 h-6" /> : rigDisplayMode === 'blink' ? <RigBlinkIcon className="w-6 h-6" /> : <RigIcon className="w-6 h-6" />}
            label={!hasRigData ? 'N/A' : !showRig ? 'OFF' : rigDisplayMode === 'blink' ? 'BLK' : 'RIG'}
          />
        }
        tooltip={!hasRigData ? 'Rig not available' : !showRig ? 'Rig connections off' : rigDisplayMode === 'blink' ? 'Rig blink' : 'Rig static'}
        isActive={hasRigData && showRig}
        onClick={hasRigData ? cycleRigDisplayMode : undefined}
        panelTitle="Rig Connections"
        disabled={!hasRigData}
      >
        <div className={styles.panelContent}>
          {hasRigData ? (
            <>
              <ToggleRow label="Show Rig" checked={showRig} onChange={setShowRig} />
              {showRig && (
                <SelectRow
                  label="Mode"
                  value={rigDisplayMode}
                  onChange={(v) => setRigDisplayMode(v as RigDisplayMode)}
                  options={[
                    { value: 'static', label: 'Static' },
                    { value: 'blink', label: 'Blink' },
                  ]}
                />
              )}
              {showRig && (
                <>
                  <SelectRow
                    label="Color"
                    value={rigColorMode}
                    onChange={(v) => setRigColorMode(v as RigColorMode)}
                    options={[
                      { value: 'single', label: 'Single' },
                      { value: 'perFrame', label: 'Per Frame' },
                    ]}
                  />
                  {rigColorMode === 'single' && (
                    <HueRow label="Hue" value={rigLineColor} onChange={setRigLineColor} />
                  )}
                  <SliderRow
                    label="Opacity"
                    value={rigLineOpacity}
                    min={0.1}
                    max={1}
                    step={0.05}
                    onChange={setRigLineOpacity}
                    formatValue={(v) => v.toFixed(2)}
                  />
                </>
              )}
              <div className="text-ds-secondary text-sm mt-3">
                <div className="mb-1 font-medium">Detected Rig:</div>
                <div>{cameraCount} camera{cameraCount !== 1 ? 's' : ''}, {frameCount} frame{frameCount !== 1 ? 's' : ''}</div>
                <div className="mt-2">
                  {!showRig ? (
                    <div>Connection lines hidden.</div>
                  ) : (
                    <div>Lines connect cameras with</div>
                  )}
                </div>
                <div>matching frame names</div>
                <div>(e.g. cam_1/00.png, cam_2/00.png)</div>
              </div>
            </>
          ) : (
            <div className="text-ds-secondary text-sm">
              <div className="mb-2 font-medium">No Multi-Camera Data</div>
              <div>To use this feature, images</div>
              <div>need directory/filename format:</div>
              <div className="mt-2 font-mono text-xs">
                <div>• cam_1/frame_00.png</div>
                <div>• cam_2/frame_00.png</div>
              </div>
              <div className="mt-2">Images with same filename</div>
              <div>are connected as a rig.</div>
            </div>
          )}
        </div>
      </ControlButton>

      <ScreenshotPanel activePanel={activePanel} setActivePanel={setActivePanel} />

      <SharePanel activePanel={activePanel} setActivePanel={setActivePanel} />

      <ExportPanel activePanel={activePanel} setActivePanel={setActivePanel} />

      {/* Settings Panel */}
      <ControlButton
        panelId="settings"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={<SettingsIcon className="w-6 h-6" />}
        tooltip="Settings"
        panelTitle="Settings"
      >
        <div className={styles.panelContent}>
          {/* Profiles Section */}
          <div className="text-ds-muted text-xs uppercase tracking-wide mb-2">Profiles</div>
          <ProfileSelector />

          {/* Configuration Section */}
          <div className="text-ds-muted text-xs uppercase tracking-wide mt-4 mb-2">Configuration</div>
          <div className={styles.actionGroup}>
            <button
              onClick={() => {
                const config = extractConfigurationFromStores();
                const yaml = serializeConfigToYaml(config);
                const blob = new Blob([yaml], { type: 'text/yaml' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'colmapview-config.yml';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              className={styles.actionButton}
            >
              Export Config
            </button>
          </div>
          <div className={styles.actionGroup}>
            <button
              onClick={() => {
                if (confirm('Clear all settings and reload? This cannot be undone.')) {
                  localStorage.clear();
                  // Mark warning as shown so it doesn't reappear after reset
                  markSettingsResetWarningShown();
                  window.location.reload();
                }
              }}
              className={styles.actionButton}
            >
              Clear Settings
            </button>
          </div>

          {/* Customization Section */}
          <div className="text-ds-muted text-xs uppercase tracking-wide mt-4 mb-2">Customization</div>
          <div className={styles.actionGroup}>
            <button
              onClick={() => {
                openContextMenuEditor();
                setActivePanel(null);
              }}
              className={styles.actionButton}
            >
              Edit Context Menu
            </button>
          </div>

          {/* Developer Section */}
          <div className="text-ds-muted text-xs uppercase tracking-wide mt-4 mb-2">Developer</div>
          <div className={styles.actionGroup}>
            <button
              onClick={() => {
                const exampleManifest = {
                  version: 1,
                  name: "NGS Lady Bug Toy",
                  baseUrl: "https://huggingface.co/datasets/OpsiClear/NGS/resolve/main/objects/scan_20250714_170841_lady_bug_toy",
                  files: {
                    cameras: "sparse/0/cameras.bin",
                    images: "sparse/0/images.bin",
                    points3D: "sparse/0/points3D.bin",
                    rigs: "sparse/0/rigs.bin",
                    frames: "sparse/0/frames.bin"
                  },
                  imagesPath: "images/",
                  masksPath: "masks/"
                };
                const json = JSON.stringify(exampleManifest, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'manifest.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              className={styles.actionButton}
            >
              Example manifest.json
            </button>
          </div>
          <div className="text-ds-secondary text-sm mt-1">
            JSON file for loading COLMAP reconstructions from URLs.
          </div>
        </div>
      </ControlButton>

      <GalleryToggleButton activePanel={activePanel} setActivePanel={setActivePanel} />
    </div>
  );
}
