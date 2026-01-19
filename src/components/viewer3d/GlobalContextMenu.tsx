import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore, useCameraStore, useTransformStore, useReconstructionStore, useExportStore, usePointPickingStore, usePointCloudStore, type ContextMenuAction, CAMERA_MODES, CAMERA_PROJECTIONS, AUTO_ROTATE_MODES, CAMERA_DISPLAY_MODES, SELECTION_COLOR_MODES, MATCHES_DISPLAY_MODES, COLOR_MODES, type AxesCoordinateSystem, type AxisLabelMode, type FrustumColorMode } from '../../store';
import { useFileDropzone } from '../../hooks/useFileDropzone';
import { contextMenuStyles, actionButtonStyles, HOTKEYS } from '../../theme';
import { formatKeyCombo } from '../../config/hotkeys';
import {
  // UI icons
  ResetIcon, ReloadIcon, CheckIcon, CloseIcon, SettingsIcon, FullscreenIcon, FilterIcon, SpeedIcon, SpeedDimIcon,
  PlusCircleIcon, MinusCircleIcon, CrosshairIcon, FlyToIcon,
  // Toolbar icons
  ScreenshotIcon, TransformIcon, FrustumIcon, AxesIcon, BgIcon,
  // Menu-specific icons
  ViewPosXIcon, ViewPosYIcon, ViewPosZIcon, ProjectionIcon, CameraModeIcon, HorizonLockIcon,
  AutoRotateIcon, GalleryPanelIcon, CoordSystemIcon, FrustumColorIcon, PointColorIcon,
  MatchesIcon, SelectionColorIcon, DeselectAllIcon, ImagePlanesIcon, UndistortIcon,
  CenterOriginIcon, OnePointOriginIcon, TwoPointScaleIcon, ThreePointAlignIcon, ExportPLYIcon, ExportConfigIcon,
} from '../../icons';

// Section definitions for grouping
type SectionId = 'view' | 'display' | 'cameras' | 'transform' | 'export' | 'menu';

const SECTION_LABELS: Record<SectionId, string> = {
  view: 'View & Navigation',
  display: 'Display & Points',
  cameras: 'Cameras',
  transform: 'Transform',
  export: 'Export',
  menu: 'Menu',
};

// Action definitions with icons and handlers
interface ActionDef {
  id: ContextMenuAction;
  label: string;
  icon: ReactElement;
  section: SectionId;
  hotkey?: string; // Optional keyboard shortcut hint
}

const ACTIONS: ActionDef[] = [
  // View section
  { id: 'resetView', label: 'Reset View', section: 'view', hotkey: HOTKEYS.resetView.keys, icon: <ResetIcon /> },
  { id: 'viewPosX', label: 'View +X', section: 'view', hotkey: HOTKEYS.viewX.keys, icon: ViewPosXIcon },
  { id: 'viewPosY', label: 'View +Y', section: 'view', hotkey: HOTKEYS.viewY.keys, icon: ViewPosYIcon },
  { id: 'viewPosZ', label: 'View +Z', section: 'view', hotkey: HOTKEYS.viewZ.keys, icon: ViewPosZIcon },
  { id: 'toggleFullscreen', label: 'Fullscreen', section: 'view', hotkey: 'F11', icon: <FullscreenIcon /> },
  { id: 'toggleProjection', label: 'Persp/Ortho', section: 'view', icon: ProjectionIcon },
  { id: 'toggleCameraMode', label: 'Camera Mode', section: 'view', hotkey: HOTKEYS.toggleCameraMode.keys, icon: CameraModeIcon },
  { id: 'toggleHorizonLock', label: 'Horizon Lock', section: 'view', icon: HorizonLockIcon },
  { id: 'cycleAutoRotate', label: 'Auto Rotate', section: 'view', icon: AutoRotateIcon },
  // Display section
  { id: 'toggleBackground', label: 'Background', section: 'display', hotkey: HOTKEYS.toggleBackground.keys, icon: <BgIcon /> },
  { id: 'toggleAxes', label: 'Axes/Grid', section: 'display', hotkey: HOTKEYS.toggleAxesGrid.keys, icon: <AxesIcon /> },
  { id: 'toggleGallery', label: 'Gallery Panel', section: 'display', icon: GalleryPanelIcon },
  { id: 'cycleCoordinateSystem', label: 'Coord System', section: 'display', icon: CoordSystemIcon },
  { id: 'cycleFrustumColor', label: 'Frustum Color', section: 'display', icon: FrustumColorIcon },
  { id: 'cyclePointColor', label: 'Point Color', section: 'display', hotkey: HOTKEYS.cyclePointSize.keys, icon: PointColorIcon },
  { id: 'pointSizeUp', label: 'Point Size +', section: 'display', icon: <PlusCircleIcon /> },
  { id: 'pointSizeDown', label: 'Point Size -', section: 'display', icon: <MinusCircleIcon /> },
  { id: 'togglePointFiltering', label: 'Min Track', section: 'display', icon: <FilterIcon /> },
  // Cameras section
  { id: 'cycleCameraDisplay', label: 'Camera Display', section: 'cameras', hotkey: HOTKEYS.cycleCameraDisplay.keys, icon: <FrustumIcon /> },
  { id: 'cycleMatchesDisplay', label: 'Matches', section: 'cameras', hotkey: HOTKEYS.cycleMatchesDisplay.keys, icon: MatchesIcon },
  { id: 'cycleSelectionColor', label: 'Selection Color', section: 'cameras', icon: SelectionColorIcon },
  { id: 'deselectAll', label: 'Deselect All', section: 'cameras', icon: DeselectAllIcon },
  { id: 'flyToSelected', label: 'Fly to Selected', section: 'cameras', icon: <FlyToIcon /> },
  { id: 'toggleImagePlanes', label: 'Image Planes', section: 'cameras', icon: ImagePlanesIcon },
  { id: 'toggleUndistort', label: 'Undistort', section: 'cameras', icon: UndistortIcon },
  // Transform section
  { id: 'toggleGizmo', label: 'Transform Gizmo', section: 'transform', hotkey: HOTKEYS.toggleGizmo.keys, icon: <TransformIcon /> },
  { id: 'centerAtOrigin', label: 'Center at Origin', section: 'transform', icon: CenterOriginIcon },
  { id: 'onePointOrigin', label: '1-Point Origin', section: 'transform', icon: OnePointOriginIcon },
  { id: 'twoPointScale', label: '2-Point Scale', section: 'transform', icon: TwoPointScaleIcon },
  { id: 'threePointAlign', label: '3-Point Align', section: 'transform', icon: ThreePointAlignIcon },
  { id: 'resetTransform', label: 'Reset Transform', section: 'transform', icon: <ResetIcon /> },
  { id: 'applyTransform', label: 'Apply Transform', section: 'transform', icon: <CheckIcon /> },
  { id: 'reloadData', label: 'Reload Data', section: 'transform', icon: <ReloadIcon /> },
  // Export section
  { id: 'takeScreenshot', label: 'Screenshot', section: 'export', icon: <ScreenshotIcon /> },
  { id: 'exportPLY', label: 'Export PLY', section: 'export', icon: ExportPLYIcon },
  { id: 'exportConfig', label: 'Export Config', section: 'export', icon: ExportConfigIcon },
  // Navigation section
  { id: 'togglePointerLock', label: 'Pointer Lock', section: 'view', icon: <CrosshairIcon /> },
  { id: 'flySpeedUp', label: 'Fly Speed +', section: 'view', icon: <SpeedIcon /> },
  { id: 'flySpeedDown', label: 'Fly Speed -', section: 'view', icon: <SpeedDimIcon /> },
  // Menu section (always at bottom, not configurable)
  { id: 'editMenu', label: 'Edit Menu...', section: 'menu', icon: <SettingsIcon /> },
];

// Get action definition by ID
function getActionDef(id: ContextMenuAction): ActionDef | undefined {
  return ACTIONS.find(a => a.id === id);
}

// Configurable actions (excludes editMenu which is always shown)
const CONFIGURABLE_ACTIONS = ACTIONS.filter(a => a.id !== 'editMenu');

export function GlobalContextMenu() {
  const menuRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState<{ x: number; y: number } | null>(null);

  // Context menu state
  const contextMenuPosition = useUIStore((s) => s.contextMenuPosition);
  const contextMenuActions = useUIStore((s) => s.contextMenuActions);
  const closeContextMenu = useUIStore((s) => s.closeContextMenu);
  const addContextMenuAction = useUIStore((s) => s.addContextMenuAction);
  const removeContextMenuAction = useUIStore((s) => s.removeContextMenuAction);
  const showEditPopup = useUIStore((s) => s.showContextMenuEditor);
  const openEditPopup = useUIStore((s) => s.openContextMenuEditor);
  const closeContextMenuEditor = useUIStore((s) => s.closeContextMenuEditor);

  // Actions from various stores
  const setView = useUIStore((s) => s.setView);
  const resetView = useUIStore((s) => s.resetView);
  const backgroundColor = useUIStore((s) => s.backgroundColor);
  const setBackgroundColor = useUIStore((s) => s.setBackgroundColor);
  const axesDisplayMode = useUIStore((s) => s.axesDisplayMode);
  const setAxesDisplayMode = useUIStore((s) => s.setAxesDisplayMode);
  const axesCoordinateSystem = useUIStore((s) => s.axesCoordinateSystem);
  const setAxesCoordinateSystem = useUIStore((s) => s.setAxesCoordinateSystem);
  const axisLabelMode = useUIStore((s) => s.axisLabelMode);
  const setAxisLabelMode = useUIStore((s) => s.setAxisLabelMode);
  const toggleGalleryCollapsed = useUIStore((s) => s.toggleGalleryCollapsed);
  const galleryCollapsed = useUIStore((s) => s.galleryCollapsed);
  const gizmoMode = useUIStore((s) => s.gizmoMode);
  const setGizmoMode = useUIStore((s) => s.setGizmoMode);
  const matchesDisplayMode = useUIStore((s) => s.matchesDisplayMode);
  const setMatchesDisplayMode = useUIStore((s) => s.setMatchesDisplayMode);

  // Camera store
  const cameraProjection = useCameraStore((s) => s.cameraProjection);
  const setCameraProjection = useCameraStore((s) => s.setCameraProjection);
  const cameraMode = useCameraStore((s) => s.cameraMode);
  const setCameraMode = useCameraStore((s) => s.setCameraMode);
  const horizonLock = useCameraStore((s) => s.horizonLock);
  const setHorizonLock = useCameraStore((s) => s.setHorizonLock);
  const autoRotateMode = useCameraStore((s) => s.autoRotateMode);
  const setAutoRotateMode = useCameraStore((s) => s.setAutoRotateMode);
  const cameraDisplayMode = useCameraStore((s) => s.cameraDisplayMode);
  const setCameraDisplayMode = useCameraStore((s) => s.setCameraDisplayMode);
  const selectionColorMode = useCameraStore((s) => s.selectionColorMode);
  const setSelectionColorMode = useCameraStore((s) => s.setSelectionColorMode);
  const frustumColorMode = useCameraStore((s) => s.frustumColorMode);
  const setFrustumColorMode = useCameraStore((s) => s.setFrustumColorMode);
  const selectedImageId = useCameraStore((s) => s.selectedImageId);
  const setSelectedImageId = useCameraStore((s) => s.setSelectedImageId);
  const flyToImage = useCameraStore((s) => s.flyToImage);
  const pointerLock = useCameraStore((s) => s.pointerLock);
  const setPointerLock = useCameraStore((s) => s.setPointerLock);
  const flySpeed = useCameraStore((s) => s.flySpeed);
  const setFlySpeed = useCameraStore((s) => s.setFlySpeed);
  const undistortionEnabled = useCameraStore((s) => s.undistortionEnabled);
  const setUndistortionEnabled = useCameraStore((s) => s.setUndistortionEnabled);

  // Point cloud store
  const colorMode = usePointCloudStore((s) => s.colorMode);
  const setColorMode = usePointCloudStore((s) => s.setColorMode);
  const pointSize = usePointCloudStore((s) => s.pointSize);
  const setPointSize = usePointCloudStore((s) => s.setPointSize);
  const minTrackLength = usePointCloudStore((s) => s.minTrackLength);
  const setMinTrackLength = usePointCloudStore((s) => s.setMinTrackLength);

  const resetTransform = useTransformStore((s) => s.resetTransform);
  const applyToData = useTransformStore((s) => s.applyToData);
  const applyPreset = useTransformStore((s) => s.applyPreset);
  const droppedFiles = useReconstructionStore((s) => s.droppedFiles);
  const { processFiles } = useFileDropzone();

  const takeScreenshot = useExportStore((s) => s.takeScreenshot);
  const setExportFormat = useExportStore((s) => s.setExportFormat);
  const triggerExport = useExportStore((s) => s.triggerExport);

  // Point picking
  const pickingMode = usePointPickingStore((s) => s.pickingMode);
  const setPickingMode = usePointPickingStore((s) => s.setPickingMode);

  // Coordinate systems for cycling
  const COORD_SYSTEMS: AxesCoordinateSystem[] = ['colmap', 'opencv', 'threejs', 'opengl', 'blender', 'unity', 'unreal'];
  const AXIS_LABEL_MODES: AxisLabelMode[] = ['off', 'xyz', 'extra'];
  const FRUSTUM_COLOR_MODES: FrustumColorMode[] = ['single', 'byCamera'];

  // Actions that should keep the menu open (toggles and cycles)
  const toggleActions: ContextMenuAction[] = [
    'toggleProjection',
    'toggleCameraMode',
    'toggleHorizonLock',
    'cycleAutoRotate',
    'toggleBackground',
    'toggleAxes',
    'toggleGallery',
    'cycleCoordinateSystem',
    'cycleFrustumColor',
    'cyclePointColor',
    'pointSizeUp',
    'pointSizeDown',
    'togglePointFiltering',
    'cycleCameraDisplay',
    'cycleMatchesDisplay',
    'cycleSelectionColor',
    'toggleImagePlanes',
    'toggleUndistort',
    'toggleGizmo',
    'togglePointerLock',
    'flySpeedUp',
    'flySpeedDown',
  ];

  // Execute action
  const executeAction = useCallback((actionId: ContextMenuAction) => {
    switch (actionId) {
      case 'resetView':
        resetView();
        setCameraProjection('perspective');
        break;
      case 'viewPosX':
        setView('x');
        break;
      case 'viewPosY':
        setView('y');
        break;
      case 'viewPosZ':
        setView('z');
        break;
      case 'toggleFullscreen':
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          document.documentElement.requestFullscreen();
        }
        break;
      case 'toggleProjection': {
        const currentIndex = CAMERA_PROJECTIONS.indexOf(cameraProjection);
        const nextIndex = (currentIndex + 1) % CAMERA_PROJECTIONS.length;
        setCameraProjection(CAMERA_PROJECTIONS[nextIndex]);
        break;
      }
      case 'toggleCameraMode': {
        const currentIndex = CAMERA_MODES.indexOf(cameraMode);
        const nextIndex = (currentIndex + 1) % CAMERA_MODES.length;
        setCameraMode(CAMERA_MODES[nextIndex]);
        break;
      }
      case 'toggleHorizonLock':
        setHorizonLock(!horizonLock);
        break;
      case 'cycleAutoRotate': {
        const currentIndex = AUTO_ROTATE_MODES.indexOf(autoRotateMode);
        const nextIndex = (currentIndex + 1) % AUTO_ROTATE_MODES.length;
        setAutoRotateMode(AUTO_ROTATE_MODES[nextIndex]);
        break;
      }
      case 'toggleBackground': {
        const isLight = backgroundColor === '#ffffff' || backgroundColor === '#fff';
        setBackgroundColor(isLight ? '#000000' : '#ffffff');
        break;
      }
      case 'toggleAxes': {
        const modes = ['off', 'axes', 'grid', 'both'] as const;
        const currentIndex = modes.indexOf(axesDisplayMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        setAxesDisplayMode(modes[nextIndex]);
        break;
      }
      case 'toggleGallery':
        toggleGalleryCollapsed();
        break;
      case 'cycleAxisLabels': {
        const currentIndex = AXIS_LABEL_MODES.indexOf(axisLabelMode);
        const nextIndex = (currentIndex + 1) % AXIS_LABEL_MODES.length;
        setAxisLabelMode(AXIS_LABEL_MODES[nextIndex]);
        break;
      }
      case 'cycleCoordinateSystem': {
        const currentIndex = COORD_SYSTEMS.indexOf(axesCoordinateSystem);
        const nextIndex = (currentIndex + 1) % COORD_SYSTEMS.length;
        setAxesCoordinateSystem(COORD_SYSTEMS[nextIndex]);
        break;
      }
      case 'cycleFrustumColor': {
        const currentIndex = FRUSTUM_COLOR_MODES.indexOf(frustumColorMode);
        const nextIndex = (currentIndex + 1) % FRUSTUM_COLOR_MODES.length;
        setFrustumColorMode(FRUSTUM_COLOR_MODES[nextIndex]);
        break;
      }
      case 'cyclePointColor': {
        const currentIndex = COLOR_MODES.indexOf(colorMode);
        const nextIndex = (currentIndex + 1) % COLOR_MODES.length;
        setColorMode(COLOR_MODES[nextIndex]);
        break;
      }
      case 'pointSizeUp':
        setPointSize(Math.min(pointSize + 1, 20));
        break;
      case 'pointSizeDown':
        setPointSize(Math.max(pointSize - 1, 1));
        break;
      case 'togglePointFiltering':
        setMinTrackLength(minTrackLength === 2 ? 3 : 2);
        break;
      case 'cycleCameraDisplay': {
        const currentIndex = CAMERA_DISPLAY_MODES.indexOf(cameraDisplayMode);
        const nextIndex = (currentIndex + 1) % CAMERA_DISPLAY_MODES.length;
        setCameraDisplayMode(CAMERA_DISPLAY_MODES[nextIndex]);
        break;
      }
      case 'cycleMatchesDisplay': {
        const currentIndex = MATCHES_DISPLAY_MODES.indexOf(matchesDisplayMode);
        const nextIndex = (currentIndex + 1) % MATCHES_DISPLAY_MODES.length;
        setMatchesDisplayMode(MATCHES_DISPLAY_MODES[nextIndex]);
        break;
      }
      case 'cycleSelectionColor': {
        const currentIndex = SELECTION_COLOR_MODES.indexOf(selectionColorMode);
        const nextIndex = (currentIndex + 1) % SELECTION_COLOR_MODES.length;
        setSelectionColorMode(SELECTION_COLOR_MODES[nextIndex]);
        break;
      }
      case 'deselectAll':
        setSelectedImageId(null);
        break;
      case 'flyToSelected':
        if (selectedImageId !== null) {
          flyToImage(selectedImageId);
        }
        break;
      case 'toggleImagePlanes': {
        const modes = ['off', 'frustum', 'imageplane'] as const;
        const currentIndex = modes.indexOf(cameraDisplayMode as typeof modes[number]);
        if (currentIndex >= 0) {
          const nextIndex = (currentIndex + 1) % modes.length;
          setCameraDisplayMode(modes[nextIndex]);
        } else {
          setCameraDisplayMode('imageplane');
        }
        break;
      }
      case 'toggleUndistort':
        setUndistortionEnabled(!undistortionEnabled);
        break;
      case 'toggleGizmo': {
        const modes = ['off', 'global', 'local'] as const;
        const currentIndex = modes.indexOf(gizmoMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        setGizmoMode(modes[nextIndex]);
        break;
      }
      case 'centerAtOrigin':
        applyPreset('centerAtOrigin');
        break;
      case 'onePointOrigin':
        setPickingMode(pickingMode === 'origin-1pt' ? 'off' : 'origin-1pt');
        break;
      case 'twoPointScale':
        setPickingMode(pickingMode === 'distance-2pt' ? 'off' : 'distance-2pt');
        break;
      case 'threePointAlign':
        setPickingMode(pickingMode === 'normal-3pt' ? 'off' : 'normal-3pt');
        break;
      case 'resetTransform':
        resetTransform();
        break;
      case 'applyTransform':
        applyToData();
        break;
      case 'reloadData':
        if (droppedFiles) {
          resetTransform();
          processFiles(droppedFiles);
        }
        break;
      case 'takeScreenshot':
        takeScreenshot();
        break;
      case 'exportPLY':
        setExportFormat('ply');
        triggerExport();
        break;
      case 'exportConfig':
        setExportFormat('config');
        triggerExport();
        break;
      case 'togglePointerLock':
        setPointerLock(!pointerLock);
        break;
      case 'flySpeedUp':
        setFlySpeed(Math.min(flySpeed * 1.5, 20));
        break;
      case 'flySpeedDown':
        setFlySpeed(Math.max(flySpeed / 1.5, 0.5));
        break;
      case 'editMenu':
        openEditPopup();
        break;
    }
    // Only close menu for non-toggle actions (editMenu opens popup instead)
    if (!toggleActions.includes(actionId) && actionId !== 'editMenu') {
      closeContextMenu();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toggleActions is a stable module-level constant
  }, [
    resetView, setView, cameraProjection, setCameraProjection, cameraMode, setCameraMode,
    horizonLock, setHorizonLock, autoRotateMode, setAutoRotateMode,
    backgroundColor, setBackgroundColor, axesDisplayMode, setAxesDisplayMode,
    axesCoordinateSystem, setAxesCoordinateSystem, axisLabelMode, setAxisLabelMode,
    frustumColorMode, setFrustumColorMode, toggleGalleryCollapsed, colorMode, setColorMode,
    pointSize, setPointSize, minTrackLength, setMinTrackLength,
    cameraDisplayMode, setCameraDisplayMode, matchesDisplayMode, setMatchesDisplayMode,
    selectionColorMode, setSelectionColorMode, selectedImageId, setSelectedImageId, flyToImage,
    undistortionEnabled, setUndistortionEnabled,
    gizmoMode, setGizmoMode, pickingMode, setPickingMode, resetTransform, applyToData, applyPreset,
    droppedFiles, processFiles, takeScreenshot, setExportFormat, triggerExport,
    pointerLock, setPointerLock, flySpeed, setFlySpeed, closeContextMenu
  ]);

  // Toggle action in config
  const toggleActionConfig = useCallback((actionId: ContextMenuAction) => {
    if (contextMenuActions.includes(actionId)) {
      removeContextMenuAction(actionId);
    } else {
      addContextMenuAction(actionId);
    }
  }, [contextMenuActions, addContextMenuAction, removeContextMenuAction]);

  // Close edit popup
  const closeEditPopup = useCallback(() => {
    closeContextMenuEditor();
    closeContextMenu();
  }, [closeContextMenu, closeContextMenuEditor]);

  // Close on click outside
  useEffect(() => {
    if (!contextMenuPosition && !showEditPopup) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedOutsideMenu = menuRef.current && !menuRef.current.contains(target);
      const clickedOutsidePopup = popupRef.current && !popupRef.current.contains(target);

      if (showEditPopup) {
        if (clickedOutsidePopup) {
          closeEditPopup();
        }
      } else if (clickedOutsideMenu) {
        closeContextMenu();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showEditPopup) {
          closeEditPopup();
        } else {
          closeContextMenu();
        }
      }
    };

    // Delay adding listener to avoid immediate close from the triggering click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenuPosition, showEditPopup, closeContextMenu, closeEditPopup]);

  // Calculate adjusted position to keep menu in viewport
  useLayoutEffect(() => {
    if (!contextMenuPosition || !menuRef.current) {
      setAdjustedPosition(null);
      return;
    }

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const padding = 8; // Minimum distance from viewport edge

    // Use measured dimensions or fallback to reasonable estimates
    const menuWidth = rect.width > 0 ? rect.width : 200;
    const menuHeight = rect.height > 0 ? rect.height : 400;

    // Account for gallery panel width when it's visible
    // Gallery is 30% of viewport width with minimum 300px
    const galleryWidth = galleryCollapsed ? 0 : Math.max(viewportWidth * 0.3, 300);
    const availableWidth = viewportWidth - galleryWidth;

    let x = contextMenuPosition.x;
    let y = contextMenuPosition.y;

    // Check if menu overflows bottom of viewport
    if (y + menuHeight > viewportHeight - padding) {
      // Position above the click point
      y = contextMenuPosition.y - menuHeight;
      // Ensure it doesn't go above the viewport
      if (y < padding) {
        y = padding;
      }
    }

    // Check if menu overflows right of available area (accounting for gallery)
    if (x + menuWidth > availableWidth - padding) {
      // Position to the left of the click point
      x = contextMenuPosition.x - menuWidth;
      // Ensure it doesn't go off the left edge
      if (x < padding) {
        x = padding;
      }
    }

    setAdjustedPosition({ x, y });
  }, [contextMenuPosition, contextMenuActions, galleryCollapsed]); // Re-run when actions or gallery state changes

  if (!contextMenuPosition && !showEditPopup) return null;

  // Create index map for sorting by original ACTIONS array order
  const actionIndexMap = new Map(ACTIONS.map((a, i) => [a.id, i]));

  // Get actions to display (only enabled ones)
  const actionsToShow = contextMenuActions
    .map(id => getActionDef(id))
    .filter((def): def is ActionDef => def !== undefined);

  // Group by section (in display order), maintaining original ACTIONS array order within each section
  const sectionOrder: SectionId[] = ['view', 'display', 'cameras', 'transform', 'export'];
  const groupedActions = sectionOrder
    .map(section => {
      const sectionActions = actionsToShow.filter(a => a.section === section);
      // Sort by position in original ACTIONS array
      sectionActions.sort((a, b) => (actionIndexMap.get(a.id) ?? 999) - (actionIndexMap.get(b.id) ?? 999));
      return { section, actions: sectionActions };
    })
    .filter(g => g.actions.length > 0);

  // Get the Edit Menu action
  const editMenuAction = getActionDef('editMenu')!;

  // Group configurable actions by section for edit popup
  const groupedConfigActions = sectionOrder
    .map(section => ({
      section,
      label: SECTION_LABELS[section],
      actions: CONFIGURABLE_ACTIONS.filter(a => a.section === section),
    }))
    .filter(g => g.actions.length > 0);

  // Edit popup
  if (showEditPopup) {
    // Render action item
    const renderAction = (action: ActionDef) => (
      <label
        key={action.id}
        className="flex items-center gap-2 cursor-pointer hover:bg-ds-hover rounded px-2 py-1"
        style={{ breakInside: 'avoid' }}
      >
        <input
          type="checkbox"
          checked={contextMenuActions.includes(action.id)}
          onChange={() => toggleActionConfig(action.id)}
          className="w-4 h-4 accent-ds-accent flex-shrink-0"
        />
        <span className="w-4 h-4 flex-shrink-0 opacity-60">{action.icon}</span>
        <span className="text-sm text-ds-primary whitespace-nowrap">{action.label}</span>
        {action.hotkey && (
          <span className="text-xs font-mono text-gray-500 ml-auto uppercase tracking-wide">
            ({formatKeyCombo(action.hotkey)})
          </span>
        )}
      </label>
    );

    // Render section with manual column distribution (column-first ordering)
    const renderSection = (group: { section: string; label: string; actions: ActionDef[] }, colCount: number = 1) => {
      // Split actions into columns (column-first: fill each column top-to-bottom)
      const itemsPerCol = Math.ceil(group.actions.length / colCount);
      const columns: ActionDef[][] = [];
      for (let i = 0; i < colCount; i++) {
        columns.push(group.actions.slice(i * itemsPerCol, (i + 1) * itemsPerCol));
      }

      return (
        <div key={group.section} className="col-span-3">
          <div className="text-xs font-medium text-ds-muted uppercase tracking-wide mb-1 px-1">
            {group.label}
          </div>
          <div
            className="grid gap-x-4"
            style={{ gridTemplateColumns: `repeat(${colCount}, minmax(180px, 1fr))` }}
          >
            {columns.map((colActions, colIndex) => (
              <div key={colIndex}>
                {colActions.map(renderAction)}
              </div>
            ))}
          </div>
        </div>
      );
    };

    // Get sections
    const viewSection = groupedConfigActions.find(g => g.section === 'view');
    const displaySection = groupedConfigActions.find(g => g.section === 'display');
    const camerasSection = groupedConfigActions.find(g => g.section === 'cameras');
    const transformSection = groupedConfigActions.find(g => g.section === 'transform');
    const exportSection = groupedConfigActions.find(g => g.section === 'export');

    return createPortal(
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000 }}
      >
        <div
          ref={popupRef}
          className="bg-ds-tertiary rounded-lg shadow-ds-lg border border-ds context-menu-edit-responsive"
          style={{ padding: '16px 24px' }}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-ds-primary font-medium text-sm">Edit Context Menu</h3>
            <button
              onClick={closeEditPopup}
              className="text-ds-muted hover:text-ds-primary transition-colors"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
          <div className="text-ds-secondary text-xs mb-3">
            Select which actions appear in the right-click menu.
          </div>

          {/* 3-column grid layout - items within sections flow into 3 cols */}
          <div className="grid grid-cols-3 gap-x-5 gap-y-3">
            {viewSection && renderSection(viewSection, 3)}
            {displaySection && renderSection(displaySection, 3)}
            {camerasSection && renderSection(camerasSection, 3)}
            {transformSection && renderSection(transformSection, 3)}
            {exportSection && renderSection(exportSection, 3)}
          </div>

          <div className="mt-4 pt-3 border-t border-ds">
            <button
              onClick={closeEditPopup}
              className={actionButtonStyles.buttonFullWidth}
            >
              Done
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // Use adjusted position if available, otherwise use original (for initial measurement)
  const displayPosition = adjustedPosition ?? contextMenuPosition;

  return (
    <div
      ref={menuRef}
      className={contextMenuStyles.container}
      style={{
        position: 'fixed',
        left: displayPosition?.x ?? 0,
        top: displayPosition?.y ?? 0,
        zIndex: 1050,
        minWidth: '160px',
        // Hide during initial measurement to prevent flash at original position
        visibility: adjustedPosition ? 'visible' : 'hidden',
      }}
    >
      {groupedActions.map((group, groupIndex) => (
        <div key={group.section}>
          {groupIndex > 0 && <div className="border-t border-ds my-1" />}
          {group.actions.map((action) => (
            <button
              key={action.id}
              className={contextMenuStyles.button}
              onClick={() => executeAction(action.id)}
            >
              <span className={contextMenuStyles.icon}>{action.icon}</span>
              <span className="flex-1">{action.label}</span>
              {action.hotkey && (
                <span className={contextMenuStyles.hotkey}>
                  ({formatKeyCombo(action.hotkey)})
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
      {/* Edit Menu option - always shown at bottom */}
      <div className="border-t border-ds my-1" />
      <button
        className={contextMenuStyles.button}
        onClick={() => executeAction('editMenu')}
      >
        <span className={contextMenuStyles.icon}>{editMenuAction.icon}</span>
        {editMenuAction.label}
      </button>
    </div>
  );
}

// Export for configuration UI
export { ACTIONS as CONTEXT_MENU_ACTIONS };
export type { ActionDef };
