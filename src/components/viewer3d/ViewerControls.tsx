import { useState, useEffect, memo, useCallback } from 'react';
import { useReconstructionStore, usePointCloudStore, useCameraStore, useUIStore, useExportStore, useTransformStore, usePointPickingStore, useRigStore, useNotificationStore, useGuideStore } from '../../store';
// sim3d transforms moved to DistanceInputModal for picking tool apply logic
import type { ColorMode } from '../../types/colmap';
import type { CameraMode, ImageLoadMode, CameraDisplayMode, FrustumColorMode, MatchesDisplayMode, SelectionColorMode, AxesDisplayMode, AxesCoordinateSystem, AxisLabelMode, ScreenshotSize, ScreenshotFormat, GizmoMode, AutoRotateMode, RigDisplayMode } from '../../store/types';
import { useHotkeys } from 'react-hotkeys-hook';
import { controlPanelStyles, HOTKEYS } from '../../theme';
import { exportReconstructionText, exportReconstructionBinary, exportPointsPLY } from '../../parsers';
import { isIdentityEuler } from '../../utils/sim3dTransforms';
import { useFileDropzone } from '../../hooks/useFileDropzone';
import { extractConfigurationFromStores, serializeConfigToYaml } from '../../config/configuration';
import { hslToHex, hexToHsl } from '../../utils/colorUtils';

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
  GridIcon,
  AxesGridIcon,
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
  SettingsIcon,
} from '../../icons';

// Import UI components from ControlComponents
import {
  SliderRow,
  HueRow,
  HueSliderRow,
  SelectRow,
  ControlButton,
  type PanelType,
} from './ControlComponents';

// Use styles from theme
const styles = controlPanelStyles;

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
  const applyPreset = useTransformStore((s) => s.applyPreset);
  const applyToData = useTransformStore((s) => s.applyToData);
  const gizmoMode = useUIStore((s) => s.gizmoMode);
  const setGizmoMode = useUIStore((s) => s.setGizmoMode);
  const { processFiles } = useFileDropzone();

  // Point picking state
  const pickingMode = usePointPickingStore((s) => s.pickingMode);
  const setPickingMode = usePointPickingStore((s) => s.setPickingMode);

  const hasChanges = !isIdentityEuler(transform);

  // Convert radians to degrees for display
  const radToDeg = (rad: number) => rad * (180 / Math.PI);
  const degToRad = (deg: number) => deg * (Math.PI / 180);

  // Cycle through gizmo modes: off → global → local → off
  const cycleGizmoMode = useCallback(() => {
    const modes: GizmoMode[] = ['off', 'global', 'local'];
    const currentIndex = modes.indexOf(gizmoMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setGizmoMode(modes[nextIndex]);
  }, [gizmoMode, setGizmoMode]);

  // Hotkey for toggling transform gizmo
  useHotkeys(
    HOTKEYS.toggleGizmo.keys,
    cycleGizmoMode,
    { scopes: HOTKEYS.toggleGizmo.scopes },
    [cycleGizmoMode]
  );

  const gizmoModeLabel = gizmoMode === 'off' ? 'Off' :
                         gizmoMode === 'local' ? 'Local' : 'Global';
  const gizmoTooltip = `Transform (T): ${gizmoModeLabel}${hasChanges ? ' (dbl-click to apply)' : ''}`;

  return (
    <ControlButton
      panelId="transform"
      activePanel={activePanel}
      setActivePanel={setActivePanel}
      icon={<TransformIcon className="w-6 h-6" />}
      tooltip={gizmoTooltip}
      isActive={gizmoMode !== 'off'}
      onClick={cycleGizmoMode}
      onDoubleClick={hasChanges ? applyToData : undefined}
      panelTitle="Transform"
      disabled={!reconstruction}
    >
      <div className={styles.panelContent}>
        {/* Gizmo mode */}
        <SelectRow
          label="Gizmo (T)"
          value={gizmoMode}
          onChange={(v) => setGizmoMode(v as GizmoMode)}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'global', label: 'Global (World)' },
            { value: 'local', label: 'Local (Object)' },
          ]}
        />

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
            onClick={() => applyPreset('centerAtOrigin')}
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
            data-tooltip="Click 1 point to set as origin (0,0,0)"
            data-tooltip-pos="bottom"
          >
            1-Point Origin
          </button>
          <button
            onClick={() => setPickingMode(pickingMode === 'distance-2pt' ? 'off' : 'distance-2pt')}
            className={pickingMode === 'distance-2pt' ? styles.actionButtonPrimary : styles.presetButton}
            data-tooltip="Click 2 points, set target distance"
            data-tooltip-pos="bottom"
          >
            2-Point Scale
          </button>
          <button
            onClick={() => setPickingMode(pickingMode === 'normal-3pt' ? 'off' : 'normal-3pt')}
            className={pickingMode === 'normal-3pt' ? styles.actionButtonPrimary : styles.presetButton}
            data-tooltip="Click 3 points clockwise to align plane with Y-up"
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
            onClick={applyToData}
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

// Gallery toggle button component
interface GalleryToggleButtonProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
}

const GalleryToggleButton = memo(function GalleryToggleButton({ activePanel, setActivePanel }: GalleryToggleButtonProps) {
  const galleryCollapsed = useUIStore((s) => s.galleryCollapsed);
  const toggleGalleryCollapsed = useUIStore((s) => s.toggleGalleryCollapsed);

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

  // Point cloud settings
  const pointSize = usePointCloudStore((s) => s.pointSize);
  const setPointSize = usePointCloudStore((s) => s.setPointSize);
  const colorMode = usePointCloudStore((s) => s.colorMode);
  const setColorMode = usePointCloudStore((s) => s.setColorMode);
  const minTrackLength = usePointCloudStore((s) => s.minTrackLength);
  const setMinTrackLength = usePointCloudStore((s) => s.setMinTrackLength);
  const maxReprojectionError = usePointCloudStore((s) => s.maxReprojectionError);
  const setMaxReprojectionError = usePointCloudStore((s) => s.setMaxReprojectionError);

  // Camera display settings
  const cameraDisplayMode = useCameraStore((s) => s.cameraDisplayMode);
  const setCameraDisplayMode = useCameraStore((s) => s.setCameraDisplayMode);
  const cameraScale = useCameraStore((s) => s.cameraScale);
  const setCameraScale = useCameraStore((s) => s.setCameraScale);
  const selectionPlaneOpacity = useCameraStore((s) => s.selectionPlaneOpacity);
  const setSelectionPlaneOpacity = useCameraStore((s) => s.setSelectionPlaneOpacity);
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
  const matchesDisplayMode = useUIStore((s) => s.matchesDisplayMode);
  const setMatchesDisplayMode = useUIStore((s) => s.setMatchesDisplayMode);
  const matchesOpacity = useUIStore((s) => s.matchesOpacity);
  const setMatchesOpacity = useUIStore((s) => s.setMatchesOpacity);
  const matchesColor = useUIStore((s) => s.matchesColor);
  const setMatchesColor = useUIStore((s) => s.setMatchesColor);
  const axesDisplayMode = useUIStore((s) => s.axesDisplayMode);
  const setAxesDisplayMode = useUIStore((s) => s.setAxesDisplayMode);
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
  const imageLoadMode = useUIStore((s) => s.imageLoadMode);
  const setImageLoadMode = useUIStore((s) => s.setImageLoadMode);
  const openContextMenuEditor = useUIStore((s) => s.openContextMenuEditor);

  // Export settings
  const screenshotSize = useExportStore((s) => s.screenshotSize);
  const setScreenshotSize = useExportStore((s) => s.setScreenshotSize);
  const screenshotFormat = useExportStore((s) => s.screenshotFormat);
  const setScreenshotFormat = useExportStore((s) => s.setScreenshotFormat);
  const screenshotHideLogo = useExportStore((s) => s.screenshotHideLogo);
  const setScreenshotHideLogo = useExportStore((s) => s.setScreenshotHideLogo);
  const takeScreenshot = useExportStore((s) => s.takeScreenshot);
  const exportFormat = useExportStore((s) => s.exportFormat);
  const setExportFormat = useExportStore((s) => s.setExportFormat);
  const reconstruction = useReconstructionStore((s) => s.reconstruction);

  // Rig settings (only shown when rig data is available)
  const rigDisplayMode = useRigStore((s) => s.rigDisplayMode);
  const setRigDisplayMode = useRigStore((s) => s.setRigDisplayMode);
  const rigLineOpacity = useRigStore((s) => s.rigLineOpacity);
  const setRigLineOpacity = useRigStore((s) => s.setRigLineOpacity);
  const hasRigData = Boolean(reconstruction?.rigData);
  const rigCount = reconstruction?.rigData?.rigs.size ?? 0;
  const frameCount = reconstruction?.rigData?.frames.size ?? 0;

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
        exportReconstructionText(reconstruction);
        break;
      case 'binary':
        exportReconstructionBinary(reconstruction);
        break;
      case 'ply':
        exportPointsPLY(reconstruction);
        break;
    }
  }, [reconstruction, exportFormat]);

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

  const toggleCameraMode = useCallback(() => {
    setCameraMode(cameraMode === 'orbit' ? 'fly' : 'orbit');
  }, [cameraMode, setCameraMode]);

  const toggleUndistortion = useCallback(() => {
    setUndistortionEnabled(!undistortionEnabled);
  }, [undistortionEnabled, setUndistortionEnabled]);

  // Cycle through color modes: rgb → error → trackLength → rgb
  const cycleColorMode = useCallback(() => {
    const modes: ColorMode[] = ['rgb', 'error', 'trackLength'];
    const currentIndex = modes.indexOf(colorMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setColorMode(modes[nextIndex]);
  }, [colorMode, setColorMode]);

  // Cycle through camera display modes: off → frustum → arrow → imageplane → off
  const cycleCameraDisplayMode = useCallback(() => {
    const modes: CameraDisplayMode[] = ['off', 'frustum', 'arrow', 'imageplane'];
    const currentIndex = modes.indexOf(cameraDisplayMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setCameraDisplayMode(modes[nextIndex]);
  }, [cameraDisplayMode, setCameraDisplayMode]);

  // Cycle through matches display modes: off → on → blink → off
  const cycleMatchesDisplayMode = useCallback(() => {
    const modes: MatchesDisplayMode[] = ['off', 'on', 'blink'];
    const currentIndex = modes.indexOf(matchesDisplayMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setMatchesDisplayMode(modes[nextIndex]);
  }, [matchesDisplayMode, setMatchesDisplayMode]);

  // Cycle through selection color modes: off → static → blink → rainbow → off
  const cycleSelectionColorMode = useCallback(() => {
    const modes: SelectionColorMode[] = ['off', 'static', 'blink', 'rainbow'];
    const currentIndex = modes.indexOf(selectionColorMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setSelectionColorMode(modes[nextIndex]);
  }, [selectionColorMode, setSelectionColorMode]);

  // Cycle through axes display modes: off → axes → grid → both → off
  const cycleAxesDisplayMode = useCallback(() => {
    const modes: AxesDisplayMode[] = ['off', 'axes', 'grid', 'both'];
    const currentIndex = modes.indexOf(axesDisplayMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setAxesDisplayMode(modes[nextIndex]);
  }, [axesDisplayMode, setAxesDisplayMode]);

  // Cycle through rig display modes: off → lines → off (hull not yet implemented)
  const cycleRigDisplayMode = useCallback(() => {
    const modes: RigDisplayMode[] = ['off', 'lines'];
    const currentIndex = modes.indexOf(rigDisplayMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setRigDisplayMode(modes[nextIndex]);
  }, [rigDisplayMode, setRigDisplayMode]);

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

  // Hotkey for cycling axes/grid
  useHotkeys(
    HOTKEYS.toggleAxesGrid.keys,
    cycleAxesDisplayMode,
    { scopes: HOTKEYS.toggleAxesGrid.scopes },
    [cycleAxesDisplayMode]
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

          <div className="flex gap-1 mb-3">
            <button
              onClick={() => setView('x')}
              className={styles.actionButton}
              style={{ flex: 1 }}
            >
              X <span className="text-ds-muted text-xs">(1)</span>
            </button>
            <button
              onClick={() => setView('y')}
              className={styles.actionButton}
              style={{ flex: 1 }}
            >
              Y <span className="text-ds-muted text-xs">(2)</span>
            </button>
            <button
              onClick={() => setView('z')}
              className={styles.actionButton}
              style={{ flex: 1 }}
            >
              Z <span className="text-ds-muted text-xs">(3)</span>
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
              axesDisplayMode === 'off' ? <AxesOffIcon className="w-6 h-6" /> :
              axesDisplayMode === 'axes' ? <AxesIcon className="w-6 h-6" /> :
              axesDisplayMode === 'grid' ? <GridIcon className="w-6 h-6" /> :
              <AxesGridIcon className="w-6 h-6" />
            }
            label={axesDisplayMode === 'off' ? 'OFF' : axesDisplayMode === 'axes' ? 'AXS' : axesDisplayMode === 'grid' ? 'GRD' : 'A+G'}
          />
        }
        tooltip={
          axesDisplayMode === 'off' ? 'Axes off (G)' :
          axesDisplayMode === 'axes' ? 'Show axes (G)' :
          axesDisplayMode === 'grid' ? 'Show grid (G)' :
          'Axes + Grid (G)'
        }
        isActive={axesDisplayMode !== 'off'}
        onClick={cycleAxesDisplayMode}
        panelTitle="Axes / Grid (G)"
      >
        <div className={styles.panelContent}>
          <SelectRow
            label="Mode"
            value={axesDisplayMode}
            onChange={(v) => setAxesDisplayMode(v as AxesDisplayMode)}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'axes', label: 'Axes' },
              { value: 'grid', label: 'Grid' },
              { value: 'both', label: 'Axes + Grid' },
            ]}
          />
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
          {(axesDisplayMode === 'axes' || axesDisplayMode === 'both') && (
            <>
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
                formatValue={(v) => `10^${v.toFixed(1)}`}
              />
            </>
          )}
          {(axesDisplayMode === 'grid' || axesDisplayMode === 'both') && (
            <SliderRow
              label="Grid Scale"
              value={Math.log10(gridScale)}
              min={-3}
              max={3}
              step={0.1}
              onChange={(v) => setGridScale(Math.pow(10, v))}
              formatValue={(v) => `10^${v.toFixed(1)}`}
            />
          )}
          {(axesDisplayMode === 'axes' || axesDisplayMode === 'both') && (
            <div className="text-ds-secondary text-sm mt-3">
              <div className="mb-1 font-medium">Coordinate System:</div>
              <div>Different systems have different</div>
              <div>rest views and may affect</div>
              <div>horizon lock behavior.</div>
            </div>
          )}
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
          <div className={styles.row}>
            <label className={styles.label}>Pointer Lock</label>
            <input
              type="checkbox"
              checked={pointerLock}
              onChange={(e) => setPointerLock(e.target.checked)}
              className="w-4 h-4 accent-blue-500"
            />
            <span className={styles.value} />
          </div>
          <div className={styles.row}>
            <label className={styles.label}>Horizon Lock</label>
            <input
              type="checkbox"
              checked={horizonLock}
              onChange={(e) => setHorizonLock(e.target.checked)}
              className="w-4 h-4 accent-blue-500"
            />
            <span className={styles.value} />
          </div>
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

      <ControlButton
        panelId="points"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={
          <HoverIcon
            icon={
              colorMode === 'rgb' ? <ColorRgbIcon className="w-6 h-6" /> :
              colorMode === 'error' ? <ColorErrorIcon className="w-6 h-6" /> :
              <ColorTrackIcon className="w-6 h-6" />
            }
            label={colorMode === 'rgb' ? 'RGB' : colorMode === 'error' ? 'ERR' : 'TRK'}
          />
        }
        tooltip={
          colorMode === 'rgb' ? 'Point Cloud: RGB (P)' :
          colorMode === 'error' ? 'Point Cloud: Error (P)' :
          'Point Cloud: Track (P)'
        }
        onClick={cycleColorMode}
        panelTitle="Point Cloud (P)"
      >
        <div className={styles.panelContent}>
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
          <SliderRow label="Size" value={pointSize} min={1} max={10} step={0.5} onChange={setPointSize} />
          <SliderRow label="Min Track" value={minTrackLength} min={0} max={20} step={1} onChange={(v) => setMinTrackLength(Math.round(v))} />
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
              cameraDisplayMode === 'off' ? <CameraOffIcon className="w-6 h-6" /> :
              cameraDisplayMode === 'frustum' ? <FrustumIcon className="w-6 h-6" /> :
              cameraDisplayMode === 'arrow' ? <ArrowIcon className="w-6 h-6" /> :
              <ImageIcon className="w-6 h-6" />
            }
            label={cameraDisplayMode === 'off' ? 'OFF' : cameraDisplayMode === 'frustum' ? 'FRM' : cameraDisplayMode === 'arrow' ? 'ARW' : 'IMG'}
          />
        }
        tooltip={
          cameraDisplayMode === 'off' ? 'Cameras hidden (F)' :
          cameraDisplayMode === 'frustum' ? 'Frustum mode (F)' :
          cameraDisplayMode === 'arrow' ? 'Arrow mode (F)' :
          'Image plane mode (F)'
        }
        isActive={cameraDisplayMode !== 'off'}
        onClick={cycleCameraDisplayMode}
        panelTitle="Camera Display (F)"
      >
        <div className={styles.panelContent}>
          <SelectRow
            label="Mode"
            value={cameraDisplayMode}
            onChange={(v) => setCameraDisplayMode(v as CameraDisplayMode)}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'frustum', label: 'Frustum' },
              { value: 'arrow', label: 'Arrow' },
              { value: 'imageplane', label: 'Image Plane' },
            ]}
          />
          {cameraDisplayMode !== 'off' && (
            <>
              <SelectRow
                label="Color"
                value={frustumColorMode}
                onChange={(v) => setFrustumColorMode(v as FrustumColorMode)}
                options={[
                  { value: 'single', label: 'Single' },
                  { value: 'byCamera', label: 'By Cam' },
                ]}
              />
              <SliderRow label="Scale" value={cameraScale} min={0.05} max={1} step={0.05} onChange={setCameraScale} formatValue={(v) => v.toFixed(2)} />
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
                <input
                  type="checkbox"
                  checked={undistortionEnabled}
                  onChange={(e) => setUndistortionEnabled(e.target.checked)}
                  className="w-4 h-4 accent-blue-500"
                />
                <span className={styles.value} />
              </div>
            </>
          )}
          <div className="text-ds-secondary text-sm mt-3">
            {cameraDisplayMode === 'off' ? (
              <>
                <div className="mb-1 font-medium">Off:</div>
                <div>Camera visualizations hidden.</div>
              </>
            ) : cameraDisplayMode === 'frustum' ? (
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

      {cameraDisplayMode !== 'off' && (
        <>
          {cameraDisplayMode !== 'imageplane' && (
            <ControlButton
            panelId="matches"
            activePanel={activePanel}
            setActivePanel={setActivePanel}
            icon={
              matchesDisplayMode === 'off' ? <MatchOffIcon className="w-6 h-6" /> :
              matchesDisplayMode === 'on' ? <MatchOnIcon className="w-6 h-6" /> :
              <MatchBlinkIcon className="w-6 h-6" />
            }
            tooltip={
              matchesDisplayMode === 'off' ? 'Matches off (M)' :
              matchesDisplayMode === 'on' ? 'Matches on (M)' :
              'Matches blink (M)'
            }
            isActive={matchesDisplayMode !== 'off'}
            onClick={cycleMatchesDisplayMode}
            panelTitle="Show Matches (M)"
          >
            <div className={styles.panelContent}>
              <SelectRow
                label="Mode"
                value={matchesDisplayMode}
                onChange={(v) => setMatchesDisplayMode(v as MatchesDisplayMode)}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'on', label: 'On' },
                  { value: 'blink', label: 'Blink' },
                ]}
              />
              {matchesDisplayMode !== 'off' && (
                <>
                  <SliderRow label="Opacity" value={matchesOpacity} min={0.5} max={1} step={0.05} onChange={setMatchesOpacity} formatValue={(v) => v.toFixed(2)} />
                  <HueRow label="Color" value={matchesColor} onChange={setMatchesColor} />
                </>
              )}
              <div className="text-ds-secondary text-sm mt-3">
                {matchesDisplayMode === 'off' ? (
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
              selectionColorMode === 'off' ? <SelectionOffIcon className="w-6 h-6" /> :
              selectionColorMode === 'static' ? <SelectionStaticIcon className="w-6 h-6" /> :
              selectionColorMode === 'blink' ? <SelectionBlinkIcon className="w-6 h-6" /> :
              <RainbowIcon className="w-6 h-6" />
            }
            tooltip={
              selectionColorMode === 'off' ? 'Camera only' :
              selectionColorMode === 'static' ? 'Static color' :
              selectionColorMode === 'blink' ? 'Blink' : 'Rainbow'
            }
            isActive={selectionColorMode !== 'off'}
            onClick={cycleSelectionColorMode}
            panelTitle="Selection Color"
          >
            <div className={styles.panelContent}>
              <SelectRow
                label="Mode"
                value={selectionColorMode}
                onChange={(v) => setSelectionColorMode(v as SelectionColorMode)}
                options={[
                  { value: 'off', label: 'Camera Only' },
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
              <div className="text-ds-secondary text-sm mt-3">
                {selectionColorMode === 'off' ? (
                  <>
                    <div className="mb-1 font-medium">Camera Only:</div>
                    <div>No highlighting for</div>
                    <div>selected camera points.</div>
                  </>
                ) : selectionColorMode === 'static' ? (
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

      <TransformPanel styles={styles} activePanel={activePanel} setActivePanel={setActivePanel} />

      {/* Rig panel - disabled when no rig data is loaded */}
      <ControlButton
        panelId="rig"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={
          <HoverIcon
            icon={rigDisplayMode === 'off' || !hasRigData ? <RigOffIcon className="w-6 h-6" /> : <RigIcon className="w-6 h-6" />}
            label={!hasRigData ? 'N/A' : rigDisplayMode === 'off' ? 'OFF' : 'RIG'}
          />
        }
        tooltip={!hasRigData ? 'Rig not available' : rigDisplayMode === 'off' ? 'Rig connections off' : 'Show rig connections'}
        isActive={hasRigData && rigDisplayMode !== 'off'}
        onClick={hasRigData ? cycleRigDisplayMode : undefined}
        panelTitle="Rig Connections"
        disabled={!hasRigData}
      >
        <div className={styles.panelContent}>
          {hasRigData ? (
            <>
              <SelectRow
                label="Mode"
                value={rigDisplayMode}
                onChange={(v) => setRigDisplayMode(v as RigDisplayMode)}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'lines', label: 'Lines' },
                ]}
              />
              {rigDisplayMode !== 'off' && (
                <SliderRow
                  label="Opacity"
                  value={rigLineOpacity}
                  min={0.1}
                  max={1}
                  step={0.05}
                  onChange={setRigLineOpacity}
                  formatValue={(v) => v.toFixed(2)}
                />
              )}
              <div className="text-ds-secondary text-sm mt-3">
                <div className="mb-1 font-medium">Rig Data:</div>
                <div>{rigCount} rig{rigCount !== 1 ? 's' : ''}, {frameCount} frame{frameCount !== 1 ? 's' : ''}</div>
                <div className="mt-2">
                  {rigDisplayMode === 'off' ? (
                    <div>Connection lines hidden.</div>
                  ) : (
                    <div>Cyan lines connect cameras</div>
                  )}
                </div>
                <div>that captured together in</div>
                <div>each rig frame.</div>
              </div>
            </>
          ) : (
            <div className="text-ds-secondary text-sm">
              <div className="mb-2 font-medium">No Rig Data</div>
              <div>To use this feature, load a</div>
              <div>COLMAP reconstruction with:</div>
              <div className="mt-2 font-mono text-xs">
                <div>• rigs.bin / rigs.txt</div>
                <div>• frames.bin / frames.txt</div>
              </div>
              <div className="mt-2">These files are created when</div>
              <div>using multi-camera rigs.</div>
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

      <ControlButton
        panelId="export"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={<ExportIcon className="w-6 h-6" />}
        tooltip="Export"
        onClick={handleExport}
        panelTitle="Export"
      >
        <div className={styles.panelContent}>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => { setExportFormat('binary'); if (reconstruction) exportReconstructionBinary(reconstruction); }}
              disabled={!reconstruction}
              className={reconstruction ? styles.actionButton : styles.actionButtonDisabled}
            >
              Binary (.bin)
            </button>
            <button
              onClick={() => { setExportFormat('text'); if (reconstruction) exportReconstructionText(reconstruction); }}
              disabled={!reconstruction}
              className={reconstruction ? styles.actionButton : styles.actionButtonDisabled}
            >
              Text (.txt)
            </button>
            <button
              onClick={() => { setExportFormat('ply'); if (reconstruction) exportPointsPLY(reconstruction); }}
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
          </div>
          <div className="text-ds-secondary text-sm mt-3">
            <div className="mb-1 font-medium">Export Options:</div>
            <div><span className="text-ds-primary">Binary/Text:</span> COLMAP format</div>
            <div><span className="text-ds-primary">Points:</span> PLY point cloud</div>
            <div><span className="text-ds-primary">Config:</span> ColmapView settings</div>
          </div>
          <div className="text-ds-muted text-xs mt-3 italic">
            Remember to apply transforms before exporting models.
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
          <SelectRow
            label="Img Load"
            value={imageLoadMode}
            onChange={(v) => setImageLoadMode(v as ImageLoadMode)}
            options={[
              { value: 'prefetch', label: 'Prefetch' },
              { value: 'lazy', label: 'Lazy' },
              { value: 'skip', label: 'Skip' },
            ]}
          />
          <div className="text-ds-secondary text-xs mt-1 mb-3">
            {imageLoadMode === 'prefetch' ? 'Load all images upfront' :
             imageLoadMode === 'lazy' ? 'Load images on demand (recommended)' :
             'No images loaded'}
          </div>
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
                  window.location.reload();
                }
              }}
              className={styles.actionButton}
            >
              Clear Settings
            </button>
          </div>
        </div>
      </ControlButton>

      <GalleryToggleButton activePanel={activePanel} setActivePanel={setActivePanel} />
    </div>
  );
}
