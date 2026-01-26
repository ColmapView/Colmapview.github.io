import { useState, useEffect, memo, useCallback, useMemo } from 'react';
import {
  useReconstructionStore,
  usePointCloudStore,
  useCameraStore,
  useUIStore,
  useExportStore,
  useTransformStore,
  usePointPickingStore,
  useRigStore,
  useNotificationStore,
  useGuideStore,
  applyTransformPreset,
  applyTransformToData,
} from '../../store';
import { useFloorPlaneStore, type FloorColorMode } from '../../store/stores/floorPlaneStore';
import { markSettingsResetWarningShown } from '../../store/migration';
import { detectPlaneRANSAC, computeDistancesToPlane, transformPositions } from '../../utils/ransac';
import { createSim3dFromEuler, isIdentityEuler } from '../../utils/sim3dTransforms';
// sim3d transforms moved to DistanceInputModal for picking tool apply logic
import type { ColorMode } from '../../types/colmap';
import type { CameraMode, CameraDisplayMode, CameraScaleFactor, FrustumColorMode, MatchesDisplayMode, SelectionColorMode, AxesCoordinateSystem, AxisLabelMode, ScreenshotSize, ScreenshotFormat, AutoRotateMode, HorizonLockMode, RigDisplayMode, RigColorMode } from '../../store/types';
import { useHotkeys } from 'react-hotkeys-hook';
import { controlPanelStyles, HOTKEYS } from '../../theme';
import { exportReconstructionText, exportReconstructionBinary, exportPointsPLY, downloadReconstructionZip } from '../../parsers';
import { useFileDropzone } from '../../hooks/useFileDropzone';
import { extractConfigurationFromStores, serializeConfigToYaml } from '../../config/configuration';
import { hslToHex, hexToHsl } from '../../utils/colorUtils';
import { generateShareableUrl, generateEmbedUrl, generateIframeHtml, copyWithFeedback } from '../../hooks/useUrlState';
import { CheckIcon } from '../../icons';
import { ToggleSwitch } from '../ui/ToggleSwitch';

// Import icons from centralized icons folder
import {
  HoverIcon,
  ScreenshotIcon,
  ExportIcon,
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
  ShareIcon,
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
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [copiedEmbedUrl, setCopiedEmbedUrl] = useState(false);
  const [copiedEmbedHtml, setCopiedEmbedHtml] = useState(false);
  const [includeShareLink, setIncludeShareLink] = useState(true);
  const [includeScreenshot, setIncludeScreenshot] = useState(true);
  const [recordCountdown, setRecordCountdown] = useState<number | null>(null);

  // Point cloud settings
  const showPointCloud = usePointCloudStore((s) => s.showPointCloud);
  const togglePointCloud = usePointCloudStore((s) => s.togglePointCloud);
  const pointSize = usePointCloudStore((s) => s.pointSize);
  const setPointSize = usePointCloudStore((s) => s.setPointSize);
  const pointOpacity = usePointCloudStore((s) => s.pointOpacity);
  const setPointOpacity = usePointCloudStore((s) => s.setPointOpacity);
  const colorMode = usePointCloudStore((s) => s.colorMode);
  const setColorMode = usePointCloudStore((s) => s.setColorMode);
  const minTrackLength = usePointCloudStore((s) => s.minTrackLength);
  const setMinTrackLength = usePointCloudStore((s) => s.setMinTrackLength);
  const maxReprojectionError = usePointCloudStore((s) => s.maxReprojectionError);
  const setMaxReprojectionError = usePointCloudStore((s) => s.setMaxReprojectionError);
  const thinning = usePointCloudStore((s) => s.thinning);
  const setThinning = usePointCloudStore((s) => s.setThinning);

  // Camera display settings
  const showCameras = useCameraStore((s) => s.showCameras);
  const setShowCameras = useCameraStore((s) => s.setShowCameras);
  const cameraDisplayMode = useCameraStore((s) => s.cameraDisplayMode);
  const setCameraDisplayMode = useCameraStore((s) => s.setCameraDisplayMode);
  const cameraScaleFactor = useCameraStore((s) => s.cameraScaleFactor);
  const setCameraScaleFactor = useCameraStore((s) => s.setCameraScaleFactor);
  const cameraScale = useCameraStore((s) => s.cameraScale);
  const setCameraScale = useCameraStore((s) => s.setCameraScale);
  const selectionPlaneOpacity = useCameraStore((s) => s.selectionPlaneOpacity);
  const setSelectionPlaneOpacity = useCameraStore((s) => s.setSelectionPlaneOpacity);
  const showSelectionHighlight = useCameraStore((s) => s.showSelectionHighlight);
  const setShowSelectionHighlight = useCameraStore((s) => s.setShowSelectionHighlight);
  const selectionColorMode = useCameraStore((s) => s.selectionColorMode);
  const setSelectionColorMode = useCameraStore((s) => s.setSelectionColorMode);
  const selectionColor = useCameraStore((s) => s.selectionColor);
  const setSelectionColor = useCameraStore((s) => s.setSelectionColor);
  const selectionAnimationSpeed = useCameraStore((s) => s.selectionAnimationSpeed);
  const setSelectionAnimationSpeed = useCameraStore((s) => s.setSelectionAnimationSpeed);
  const cameraMode = useCameraStore((s) => s.cameraMode);
  const setCameraMode = useCameraStore((s) => s.setCameraMode);
  const flySpeed = useCameraStore((s) => s.flySpeed);
  const setFlySpeed = useCameraStore((s) => s.setFlySpeed);
  const flyTransitionDuration = useCameraStore((s) => s.flyTransitionDuration);
  const setFlyTransitionDuration = useCameraStore((s) => s.setFlyTransitionDuration);
  const pointerLock = useCameraStore((s) => s.pointerLock);
  const setPointerLock = useCameraStore((s) => s.setPointerLock);
  const frustumColorMode = useCameraStore((s) => s.frustumColorMode);
  const setFrustumColorMode = useCameraStore((s) => s.setFrustumColorMode);
  const unselectedCameraOpacity = useCameraStore((s) => s.unselectedCameraOpacity);
  const setUnselectedCameraOpacity = useCameraStore((s) => s.setUnselectedCameraOpacity);
  const cameraProjection = useCameraStore((s) => s.cameraProjection);
  const setCameraProjection = useCameraStore((s) => s.setCameraProjection);
  const cameraFov = useCameraStore((s) => s.cameraFov);
  const setCameraFov = useCameraStore((s) => s.setCameraFov);
  const horizonLock = useCameraStore((s) => s.horizonLock);
  const setHorizonLock = useCameraStore((s) => s.setHorizonLock);
  const autoRotateMode = useCameraStore((s) => s.autoRotateMode);
  const setAutoRotateMode = useCameraStore((s) => s.setAutoRotateMode);
  const autoRotateSpeed = useCameraStore((s) => s.autoRotateSpeed);
  const setAutoRotateSpeed = useCameraStore((s) => s.setAutoRotateSpeed);
  const undistortionEnabled = useCameraStore((s) => s.undistortionEnabled);
  const setUndistortionEnabled = useCameraStore((s) => s.setUndistortionEnabled);

  // UI settings
  const showMatches = useUIStore((s) => s.showMatches);
  const setShowMatches = useUIStore((s) => s.setShowMatches);
  const matchesDisplayMode = useUIStore((s) => s.matchesDisplayMode);
  const setMatchesDisplayMode = useUIStore((s) => s.setMatchesDisplayMode);
  const matchesOpacity = useUIStore((s) => s.matchesOpacity);
  const setMatchesOpacity = useUIStore((s) => s.setMatchesOpacity);
  const matchesColor = useUIStore((s) => s.matchesColor);
  const setMatchesColor = useUIStore((s) => s.setMatchesColor);
  const showAxes = useUIStore((s) => s.showAxes);
  const showGrid = useUIStore((s) => s.showGrid);
  const setShowAxes = useUIStore((s) => s.setShowAxes);
  const setShowGrid = useUIStore((s) => s.setShowGrid);
  const toggleAxes = useUIStore((s) => s.toggleAxes);
  const toggleGrid = useUIStore((s) => s.toggleGrid);
  const axesCoordinateSystem = useUIStore((s) => s.axesCoordinateSystem);
  const setAxesCoordinateSystem = useUIStore((s) => s.setAxesCoordinateSystem);
  const axesScale = useUIStore((s) => s.axesScale);
  const setAxesScale = useUIStore((s) => s.setAxesScale);
  const gridScale = useUIStore((s) => s.gridScale);
  const setGridScale = useUIStore((s) => s.setGridScale);
  const axisLabelMode = useUIStore((s) => s.axisLabelMode);
  const setAxisLabelMode = useUIStore((s) => s.setAxisLabelMode);
  const backgroundColor = useUIStore((s) => s.backgroundColor);
  const setBackgroundColor = useUIStore((s) => s.setBackgroundColor);
  const setView = useUIStore((s) => s.setView);
  const openContextMenuEditor = useUIStore((s) => s.openContextMenuEditor);

  // Export settings
  const screenshotSize = useExportStore((s) => s.screenshotSize);
  const setScreenshotSize = useExportStore((s) => s.setScreenshotSize);
  const screenshotFormat = useExportStore((s) => s.screenshotFormat);
  const setScreenshotFormat = useExportStore((s) => s.setScreenshotFormat);
  const screenshotHideLogo = useExportStore((s) => s.screenshotHideLogo);
  const setScreenshotHideLogo = useExportStore((s) => s.setScreenshotHideLogo);
  const takeScreenshot = useExportStore((s) => s.takeScreenshot);
  const getScreenshotBlob = useExportStore((s) => s.getScreenshotBlob);
  const recordGif = useExportStore((s) => s.recordGif);
  const isRecordingGif = useExportStore((s) => s.isRecordingGif);
  const gifRenderProgress = useExportStore((s) => s.gifRenderProgress);
  const gifBlobUrl = useExportStore((s) => s.gifBlobUrl);
  const gifDuration = useExportStore((s) => s.gifDuration);
  const setGifDuration = useExportStore((s) => s.setGifDuration);
  const gifDownsample = useExportStore((s) => s.gifDownsample);
  const setGifDownsample = useExportStore((s) => s.setGifDownsample);
  const downloadGif = useExportStore((s) => s.downloadGif);
  const stopRecording = useExportStore((s) => s.stopRecording);
  const recordingFormat = useExportStore((s) => s.recordingFormat);
  const setRecordingFormat = useExportStore((s) => s.setRecordingFormat);
  const recordingQuality = useExportStore((s) => s.recordingQuality);
  const setRecordingQuality = useExportStore((s) => s.setRecordingQuality);
  const gifSpeed = useExportStore((s) => s.gifSpeed);
  const setGifSpeed = useExportStore((s) => s.setGifSpeed);
  const exportFormat = useExportStore((s) => s.exportFormat);
  const setExportFormat = useExportStore((s) => s.setExportFormat);
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);
  const loadedFiles = useReconstructionStore((s) => s.loadedFiles);
  const sourceType = useReconstructionStore((s) => s.sourceType);
  const sourceUrl = useReconstructionStore((s) => s.sourceUrl);
  const sourceManifest = useReconstructionStore((s) => s.sourceManifest);
  const currentViewState = useCameraStore((s) => s.currentViewState);

  // Transform state for export panel
  const transform = useTransformStore((s) => s.transform);
  const hasTransformChanges = !isIdentityEuler(transform);

  // Check if share buttons should be shown (loaded from URL or manifest)
  const canShare = (sourceType === 'url' || sourceType === 'manifest') && reconstruction;
  const shareSource = sourceUrl ?? sourceManifest;

  // Rig settings (only shown when rig data is available)
  const showRig = useRigStore((s) => s.showRig);
  const setShowRig = useRigStore((s) => s.setShowRig);
  const rigDisplayMode = useRigStore((s) => s.rigDisplayMode);
  const setRigDisplayMode = useRigStore((s) => s.setRigDisplayMode);
  const rigColorMode = useRigStore((s) => s.rigColorMode);
  const setRigColorMode = useRigStore((s) => s.setRigColorMode);
  const rigLineColor = useRigStore((s) => s.rigLineColor);
  const setRigLineColor = useRigStore((s) => s.setRigLineColor);
  const rigLineOpacity = useRigStore((s) => s.rigLineOpacity);
  const setRigLineOpacity = useRigStore((s) => s.setRigLineOpacity);
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

  // Handle share link copy
  const handleCopyShareLink = useCallback(async () => {
    if (!shareSource) return;
    const url = generateShareableUrl(shareSource, currentViewState);
    await copyWithFeedback(url, setCopiedShareLink);
  }, [shareSource, currentViewState]);

  // Handle embed URL copy
  const handleCopyEmbedUrl = useCallback(async () => {
    if (!shareSource) return;
    const embedUrl = generateEmbedUrl(shareSource, currentViewState);
    await copyWithFeedback(embedUrl, setCopiedEmbedUrl);
  }, [shareSource, currentViewState]);

  // Handle embed HTML copy
  const handleCopyEmbedHtml = useCallback(async () => {
    if (!shareSource) return;
    const embedUrl = generateEmbedUrl(shareSource, currentViewState);
    const iframeHtml = generateIframeHtml(embedUrl);
    await copyWithFeedback(iframeHtml, setCopiedEmbedHtml);
  }, [shareSource, currentViewState]);

  // Get reconstruction stats for social sharing
  const getShareText = useCallback((withShareLink: boolean) => {
    const parts: string[] = [];

    // Add stats if reconstruction is loaded
    if (reconstruction) {
      const numPoints = reconstruction.globalStats?.totalPoints ?? 0;
      const numImages = reconstruction.images.size;
      const numCameras = reconstruction.cameras.size;

      // Format numbers with K/M suffixes
      const formatNum = (n: number) => {
        if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
        if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
        return n.toString();
      };

      if (numPoints > 0) {
        parts.push(`📍 ${formatNum(numPoints)} points`);
      }
      if (numImages > 0) {
        parts.push(`🖼️ ${numImages} images`);
      }
      if (numCameras > 1) {
        parts.push(`📷 ${numCameras} cameras`);
      }
    }

    // Add hashtags and attribution
    // If share link is included separately, don't duplicate the URL in text
    const hashtags = '#3DReconstruction #Photogrammetry #COLMAP';
    const attribution = withShareLink
      ? 'Made with ColmapView by @opsiclear'
      : 'Made with https://colmapview.github.io/ by @opsiclear';

    const placeholder = '[type something here ...]';
    if (parts.length > 0) {
      return `${placeholder}\n\n${parts.join(' | ')}\n\n${hashtags}\n${attribution}`;
    }
    return `${placeholder}\n\n${hashtags}\n${attribution}`;
  }, [reconstruction]);

  // Copy screenshot to clipboard
  const copyScreenshotToClipboard = useCallback(async () => {
    if (!getScreenshotBlob) return false;
    try {
      const blob = await getScreenshotBlob();
      if (blob) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        useNotificationStore.getState().addNotification(
          'info',
          'Screenshot copied! Press Ctrl+V to paste',
          4000
        );
        return true;
      }
    } catch (err) {
      console.error('Failed to copy screenshot to clipboard:', err);
    }
    return false;
  }, [getScreenshotBlob]);

  // Start recording with countdown
  const startRecordingWithCountdown = useCallback(() => {
    if (!recordGif || isRecordingGif || recordCountdown !== null) return;

    setRecordCountdown(3);
    useNotificationStore.getState().addNotification('info', 'Countdown (3)', 900);

    const countdown = (count: number) => {
      if (count > 0) {
        setRecordCountdown(count);
        if (count < 3) {
          useNotificationStore.getState().addNotification('info', `Countdown (${count})`, 900);
        }
        setTimeout(() => countdown(count - 1), 1000);
      } else {
        setRecordCountdown(null);
        useNotificationStore.getState().addNotification('info', 'Recording started!', 2000);
        recordGif().then(() => {
          useNotificationStore.getState().addNotification('info', 'Recording complete! Downloading...', 3000);
          // Auto download after a short delay to ensure blob URL is set
          setTimeout(() => {
            downloadGif();
          }, 100);
        });
      }
    };

    countdown(3);
  }, [recordGif, isRecordingGif, recordCountdown, downloadGif]);

  // Handle share to X (Twitter)
  const handleShareToX = useCallback(async () => {
    const url = shareSource ? generateShareableUrl(shareSource, currentViewState) : null;
    const willIncludeLink = includeShareLink && !!url;
    const text = getShareText(willIncludeLink);

    // Copy screenshot to clipboard for easy pasting (if enabled)
    if (includeScreenshot) {
      await copyScreenshotToClipboard();
    }

    // Open X share dialog
    const xUrl = willIncludeLink
      ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
      : `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(xUrl, '_blank', 'width=700,height=600');
  }, [shareSource, currentViewState, getShareText, copyScreenshotToClipboard, includeShareLink, includeScreenshot]);

  // Handle share to LinkedIn
  const handleShareToLinkedIn = useCallback(async () => {
    const url = shareSource ? generateShareableUrl(shareSource, currentViewState) : null;
    const willIncludeLink = includeShareLink && !!url;
    const text = getShareText(willIncludeLink);

    // Copy text to clipboard (LinkedIn doesn't support pre-filled text)
    try {
      const shareContent = willIncludeLink ? `${text}\n${url}` : text;
      await navigator.clipboard.writeText(shareContent);
      useNotificationStore.getState().addNotification('info', 'Message copied! Paste in LinkedIn post', 4000);
    } catch {
      // Fallback - just notify
    }

    // Copy screenshot to clipboard for easy pasting (if enabled)
    if (includeScreenshot) {
      await copyScreenshotToClipboard();
    }

    // Open LinkedIn - go to feed to create new post
    window.open('https://www.linkedin.com/feed/', '_blank', 'width=700,height=600');
  }, [shareSource, currentViewState, getShareText, copyScreenshotToClipboard, includeShareLink, includeScreenshot]);

  // Handle export action
  const handleExport = useCallback(() => {
    if (exportFormat === 'config') {
      // Config export doesn't need reconstruction
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
      return;
    }

    if (!reconstruction) return;
    switch (exportFormat) {
      case 'text':
        exportReconstructionText(reconstruction, wasmReconstruction);
        break;
      case 'binary':
        exportReconstructionBinary(reconstruction, wasmReconstruction);
        break;
      case 'ply':
        exportPointsPLY(reconstruction, wasmReconstruction);
        break;
    }
  }, [reconstruction, wasmReconstruction, exportFormat]);

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

  const toggleCameraMode = useCallback(() => {
    setCameraMode(cameraMode === 'orbit' ? 'fly' : 'orbit');
  }, [cameraMode, setCameraMode]);

  const toggleUndistortion = useCallback(() => {
    setUndistortionEnabled(!undistortionEnabled);
  }, [undistortionEnabled, setUndistortionEnabled]);

  // Cycle through color modes: rgb → error → trackLength → off → rgb
  const setShowPointCloud = usePointCloudStore((s) => s.setShowPointCloud);
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

  // Cycle through matches display modes: off → on → blink → off
  const cycleMatchesDisplayMode = useCallback(() => {
    if (!showMatches) {
      // off → on
      setShowMatches(true);
      setMatchesDisplayMode('on');
    } else if (matchesDisplayMode === 'on') {
      // on → blink
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


  // Cycle through rig display modes: off → lines → blink → off
  const cycleRigDisplayMode = useCallback(() => {
    if (!showRig) {
      // off → lines
      setShowRig(true);
      setRigDisplayMode('lines');
    } else if (rigDisplayMode === 'lines') {
      // lines → blink
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
    <div className={styles.container}>
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
              step={1}
              onChange={setCameraFov}
              formatValue={(v) => `${v}°`}
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
          <div className="text-ds-secondary text-sm mt-3">
            <div className="mb-1 font-medium">Keyboard:</div>
            <div>WASD: Move</div>
            <div>Q: Down, E/Space: Up</div>
            <div>Shift: Speed boost</div>
            {cameraMode === 'fly' && (
              <>
                <div className="mt-1 font-medium">Mouse:</div>
                <div>Drag: Look around</div>
                <div>Scroll: Move forward/back</div>
              </>
            )}
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
            value={maxReprojectionError === Infinity ? (reconstruction?.globalStats.maxError ?? 10) : maxReprojectionError}
            min={0}
            max={reconstruction?.globalStats.maxError ?? 10}
            step={0.1}
            onChange={(v) => setMaxReprojectionError(v >= (reconstruction?.globalStats.maxError ?? 10) ? Infinity : v)}
            formatValue={(v) => maxReprojectionError === Infinity ? '∞' : v.toFixed(1)}
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
              matchesDisplayMode === 'on' ? <MatchOnIcon className="w-6 h-6" /> :
              <MatchBlinkIcon className="w-6 h-6" />
            }
            tooltip={
              !showMatches ? 'Matches off (M)' :
              matchesDisplayMode === 'on' ? 'Matches on (M)' :
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
                    { value: 'on', label: 'On' },
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
                ) : matchesDisplayMode === 'on' ? (
                  <>
                    <div className="mb-1 font-medium">On:</div>
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
        tooltip={!hasRigData ? 'Rig not available' : !showRig ? 'Rig connections off' : rigDisplayMode === 'blink' ? 'Rig connections blink' : 'Show rig connections'}
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
                    { value: 'lines', label: 'Lines' },
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

      <ControlButton
        panelId="screenshot"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={<ScreenshotIcon className="w-6 h-6" />}
        tooltip="Save screenshot"
        onClick={takeScreenshot}
        panelTitle="Screenshot"
      >
        <div className={styles.panelContent}>
          <div className="text-ds-primary text-sm mb-1">Static:</div>
          <SelectRow
            label="Size"
            value={screenshotSize}
            onChange={(v) => setScreenshotSize(v as ScreenshotSize)}
            options={[
              { value: 'current', label: 'Current' },
              { value: '1280x720', label: '1280×720' },
              { value: '1920x1080', label: '1920×1080' },
              { value: '3840x2160', label: '3840×2160' },
              { value: '512x512', label: '512×512' },
              { value: '1024x1024', label: '1024×1024' },
              { value: '2048x2048', label: '2048×2048' },
            ]}
          />
          <SelectRow
            label="Format"
            value={screenshotFormat}
            onChange={(v) => setScreenshotFormat(v as ScreenshotFormat)}
            options={[
              { value: 'jpeg', label: 'JPEG' },
              { value: 'png', label: 'PNG' },
              { value: 'webp', label: 'WebP' },
            ]}
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={takeScreenshot}
              className={styles.actionButton}
              style={{ flex: 1 }}
            >
              Save
            </button>
            <button
              onClick={copyScreenshotToClipboard}
              className={styles.actionButton}
              style={{ flex: 1 }}
            >
              Copy
            </button>
          </div>
          <div className="text-ds-primary text-sm mt-3 mb-1">Dynamic:</div>
          <SelectRow
            label="Format"
            value={recordingFormat}
            onChange={(v) => setRecordingFormat(v as 'gif' | 'webm' | 'mp4')}
            options={[
              { value: 'gif', label: 'GIF' },
              { value: 'webm', label: 'WebM' },
              { value: 'mp4', label: 'MP4' },
            ]}
          />
          <SelectRow
            label="Quality"
            value={recordingQuality}
            onChange={(v) => setRecordingQuality(v as 'low' | 'medium' | 'high' | 'ultra')}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'ultra', label: 'Ultra' },
            ]}
          />
          <SliderRow
            label="Duration"
            value={gifDuration}
            min={5}
            max={120}
            step={5}
            onChange={setGifDuration}
            formatValue={(v) => `${v}s`}
            inputMax={3600}
          />
          <SelectRow
            label="Scale"
            value={String(gifDownsample)}
            onChange={(v) => setGifDownsample(Number(v))}
            options={[
              { value: '1', label: '1× (Full)' },
              { value: '2', label: '½' },
              { value: '4', label: '¼' },
              { value: '8', label: '⅛' },
            ]}
          />
          <SelectRow
            label="Speed"
            value={String(gifSpeed)}
            onChange={(v) => setGifSpeed(Number(v))}
            options={[
              { value: '1', label: '1×' },
              { value: '2', label: '2×' },
              { value: '3', label: '3×' },
              { value: '4', label: '4×' },
            ]}
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={startRecordingWithCountdown}
              disabled={isRecordingGif || gifRenderProgress !== null || !recordGif || recordCountdown !== null}
              className={isRecordingGif || gifRenderProgress !== null || recordCountdown !== null ? styles.actionButtonPrimary : styles.actionButton}
              style={{ flex: 1, minWidth: 0 }}
            >
              {recordCountdown !== null
                ? `(${recordCountdown})`
                : gifRenderProgress !== null
                  ? `Render ${gifRenderProgress}%`
                  : isRecordingGif
                    ? 'Recording...'
                    : 'Record'}
            </button>
            <button
              onClick={isRecordingGif ? stopRecording ?? undefined : downloadGif}
              disabled={recordCountdown !== null || gifRenderProgress !== null || (!isRecordingGif && !gifBlobUrl)}
              className={
                recordCountdown !== null || gifRenderProgress !== null || (!isRecordingGif && !gifBlobUrl)
                  ? styles.actionButtonDisabled
                  : isRecordingGif
                    ? styles.actionButtonPrimary
                    : styles.actionButton
              }
              style={{ flex: 1, minWidth: 0 }}
            >
              {isRecordingGif ? 'Stop' : 'Save'}
            </button>
          </div>
          <div
            onClick={() => setScreenshotHideLogo(!screenshotHideLogo)}
            className={`group text-sm mt-3 cursor-pointer ${screenshotHideLogo ? 'text-blue-400' : ''}`}
          >
            <div className="mb-1 font-medium">
              {screenshotHideLogo ? '✓ Watermark Removed!' : <span className="underline">Remove watermark:</span>}
            </div>
            <div className={screenshotHideLogo ? '' : 'text-ds-secondary group-hover:text-gray-300 transition-colors'}>By removing watermark, I agree</div>
            <div className={screenshotHideLogo ? '' : 'text-ds-secondary group-hover:text-gray-300 transition-colors'}>to provide proper attribution to</div>
            <div className={screenshotHideLogo ? '' : 'text-ds-secondary group-hover:text-gray-300 transition-colors'}>"ColmapView by OpsiClear"</div>
            <div className={screenshotHideLogo ? '' : 'text-ds-secondary group-hover:text-gray-300 transition-colors'}>when sharing the image.</div>
          </div>
        </div>
      </ControlButton>

      {/* Share button */}
      <ControlButton
        panelId="share"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={<ShareIcon className="w-6 h-6" />}
        tooltip="Share"
        panelTitle="Share"
      >
        <div className={styles.panelContent}>
          {canShare && (
            <>
              <div className="text-ds-primary text-sm mb-1">Links:</div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleCopyShareLink}
                  className={copiedShareLink ? styles.actionButtonPrimary : styles.actionButton}
                >
                  {copiedShareLink ? (
                    <><CheckIcon className="w-4 h-4 inline mr-1" />Copied!</>
                  ) : (
                    'Copy Link'
                  )}
                </button>
                <button
                  onClick={handleCopyEmbedUrl}
                  className={copiedEmbedUrl ? styles.actionButtonPrimary : styles.actionButton}
                >
                  {copiedEmbedUrl ? (
                    <><CheckIcon className="w-4 h-4 inline mr-1" />Copied!</>
                  ) : (
                    'Embed URL'
                  )}
                </button>
                <button
                  onClick={handleCopyEmbedHtml}
                  className={copiedEmbedHtml ? styles.actionButtonPrimary : styles.actionButton}
                >
                  {copiedEmbedHtml ? (
                    <><CheckIcon className="w-4 h-4 inline mr-1" />Copied!</>
                  ) : (
                    'Embed HTML'
                  )}
                </button>
              </div>
            </>
          )}
          <div className={`text-ds-primary text-sm mb-1 ${canShare ? 'mt-3' : ''}`}>Social Media:</div>
          {canShare && <ToggleRow label="Include Link" checked={includeShareLink} onChange={setIncludeShareLink} />}
          <ToggleRow label="Screen to Clipboard" checked={includeScreenshot} onChange={setIncludeScreenshot} />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleShareToX}
                className={styles.actionButton}
                style={{ flex: 1, padding: '8px' }}
                data-tooltip="Share to X"
                data-tooltip-pos="bottom"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 mx-auto" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </button>
              <button
                onClick={handleShareToLinkedIn}
                className={styles.actionButton}
                style={{ flex: 1, padding: '8px' }}
                data-tooltip="Share to LinkedIn"
                data-tooltip-pos="bottom"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 mx-auto" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </button>
            </div>
          </div>
        </ControlButton>

      <ControlButton
        panelId="export"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={<ExportIcon className="w-6 h-6" />}
        tooltip="Export"
        onClick={handleExport}
        panelTitle="Export"
        disabled={!reconstruction}
      >
        <div className={styles.panelContent}>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => { setExportFormat('binary'); if (reconstruction) exportReconstructionBinary(reconstruction, wasmReconstruction); }}
              disabled={!reconstruction}
              className={reconstruction ? styles.actionButton : styles.actionButtonDisabled}
            >
              Binary (.bin)
            </button>
            <button
              onClick={() => { setExportFormat('text'); if (reconstruction) exportReconstructionText(reconstruction, wasmReconstruction); }}
              disabled={!reconstruction}
              className={reconstruction ? styles.actionButton : styles.actionButtonDisabled}
            >
              Text (.txt)
            </button>
            <button
              onClick={() => { setExportFormat('ply'); if (reconstruction) exportPointsPLY(reconstruction, wasmReconstruction); }}
              disabled={!reconstruction}
              className={reconstruction ? styles.actionButton : styles.actionButtonDisabled}
            >
              Points (.ply)
            </button>
            <button
              onClick={() => {
                setExportFormat('config');
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
              Config (.yml)
            </button>
            <button
              onClick={async () => {
                if (!reconstruction) return;
                try {
                  await downloadReconstructionZip(
                    reconstruction,
                    { format: 'binary' },
                    loadedFiles?.imageFiles,
                    wasmReconstruction
                  );
                } catch (err) {
                  console.error('ZIP export failed:', err);
                }
              }}
              disabled={!reconstruction}
              className={reconstruction ? styles.actionButton : styles.actionButtonDisabled}
            >
              ZIP (.zip)
            </button>
          </div>
          <div className="flex justify-center mt-2">
            <button
              onClick={applyTransformToData}
              disabled={!hasTransformChanges}
              className={hasTransformChanges ? styles.actionButtonPrimary : styles.actionButtonPrimaryDisabled}
            >
              Apply Transform
            </button>
          </div>
        </div>
      </ControlButton>

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
              Example Manifest
            </button>
          </div>
          <div className="text-ds-secondary text-sm mt-3">
            <div className="mb-1 font-medium">Manifest Format:</div>
            <div>JSON file for loading COLMAP</div>
            <div>reconstructions from URLs.</div>
          </div>
        </div>
      </ControlButton>

      <GalleryToggleButton activePanel={activePanel} setActivePanel={setActivePanel} />
    </div>
  );
}
