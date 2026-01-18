import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore, useCameraStore, useTransformStore, useReconstructionStore, useExportStore, usePointPickingStore, usePointCloudStore, type ContextMenuAction, CAMERA_MODES, CAMERA_PROJECTIONS, AUTO_ROTATE_MODES, CAMERA_DISPLAY_MODES, SELECTION_COLOR_MODES, MATCHES_DISPLAY_MODES, COLOR_MODES, type AxesCoordinateSystem, type AxisLabelMode, type FrustumColorMode } from '../../store';
import { useFileDropzone } from '../../hooks/useFileDropzone';
import { contextMenuStyles, HOTKEYS } from '../../theme';
import { formatKeyCombo } from '../../config/hotkeys';

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
  {
    id: 'resetView',
    label: 'Reset View',
    section: 'view',
    hotkey: HOTKEYS.resetView.keys,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </svg>
    ),
  },
  {
    id: 'viewPosX',
    label: 'View +X',
    section: 'view',
    hotkey: HOTKEYS.viewX.keys,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 12h6" stroke="#e74c3c" strokeWidth="3" />
        <path d="M15 9l3 3-3 3" stroke="#e74c3c" />
      </svg>
    ),
  },
  {
    id: 'viewPosY',
    label: 'View +Y',
    section: 'view',
    hotkey: HOTKEYS.viewY.keys,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 12v-6" stroke="#2ecc71" strokeWidth="3" />
        <path d="M9 9l3-3 3 3" stroke="#2ecc71" />
      </svg>
    ),
  },
  {
    id: 'viewPosZ',
    label: 'View +Z',
    section: 'view',
    hotkey: HOTKEYS.viewZ.keys,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="3" fill="#3498db" />
        <path d="M12 12l4 4" stroke="#3498db" strokeWidth="2" />
      </svg>
    ),
  },
  {
    id: 'toggleFullscreen',
    label: 'Fullscreen',
    section: 'view',
    hotkey: 'F11',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3" />
      </svg>
    ),
  },
  {
    id: 'toggleProjection',
    label: 'Persp/Ortho',
    section: 'view',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 12h4M18 12h4" />
        <rect x="6" y="4" width="12" height="16" rx="1" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    id: 'toggleCameraMode',
    label: 'Camera Mode',
    section: 'view',
    hotkey: HOTKEYS.toggleCameraMode.keys,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
  },
  {
    id: 'toggleHorizonLock',
    label: 'Horizon Lock',
    section: 'view',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 12h18" />
        <path d="M12 3v6M12 15v6" />
        <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: 'cycleAutoRotate',
    label: 'Auto Rotate',
    section: 'view',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* Vertical axis */}
        <line x1="12" y1="2" x2="12" y2="22" strokeDasharray="2 2" />
        {/* Elliptical arc for perspective - 2/3 arc */}
        <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" strokeDasharray="42 21" />
        {/* Arrow head at arc end */}
        <path d="M2 12l0 3.5 3.5 -0.5" />
      </svg>
    ),
  },
  // Display section
  {
    id: 'toggleBackground',
    label: 'Background',
    section: 'display',
    hotkey: HOTKEYS.toggleBackground.keys,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v18" />
        <path d="M12 3a9 9 0 0 0 0 18" fill="currentColor" opacity="0.3" />
      </svg>
    ),
  },
  {
    id: 'toggleAxes',
    label: 'Axes/Grid',
    section: 'display',
    hotkey: HOTKEYS.toggleAxesGrid.keys,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">
        <path d="M12 12h9" stroke="#e74c3c" />
        <path d="M12 12v-9" stroke="#2ecc71" />
        <path d="M12 12l-6 6" stroke="#3498db" />
      </svg>
    ),
  },
  {
    id: 'toggleGallery',
    label: 'Gallery Panel',
    section: 'display',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="15" y1="3" x2="15" y2="21" />
      </svg>
    ),
  },
  {
    id: 'cycleCoordinateSystem',
    label: 'Coord System',
    section: 'display',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3v18M3 12h18" />
        <path d="M12 12l6-6" strokeDasharray="2 2" />
      </svg>
    ),
  },
  {
    id: 'cycleFrustumColor',
    label: 'Frustum Color',
    section: 'display',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="6" width="13" height="12" rx="2" />
        <path d="M15 10l7-4v12l-7-4z" />
        {/* Color indicator dots */}
        <circle cx="7" cy="12" r="1.5" fill="#e74c3c" stroke="none" />
        <circle cx="11" cy="12" r="1.5" fill="#2ecc71" stroke="none" />
      </svg>
    ),
  },
  // Points section
  {
    id: 'cyclePointColor',
    label: 'Point Color',
    section: 'display',
    hotkey: HOTKEYS.cyclePointSize.keys,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="7" cy="12" r="3" fill="#e74c3c" stroke="none" />
        <circle cx="12" cy="12" r="3" fill="#2ecc71" stroke="none" />
        <circle cx="17" cy="12" r="3" fill="#3498db" stroke="none" />
      </svg>
    ),
  },
  {
    id: 'pointSizeUp',
    label: 'Point Size +',
    section: 'display',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="6" fill="currentColor" opacity="0.3" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
  },
  {
    id: 'pointSizeDown',
    label: 'Point Size -',
    section: 'display',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="4" fill="currentColor" opacity="0.3" />
        <path d="M8 12h8" />
      </svg>
    ),
  },
  {
    id: 'togglePointFiltering',
    label: 'Min Track',
    section: 'display',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
      </svg>
    ),
  },
  // Cameras section
  {
    id: 'cycleCameraDisplay',
    label: 'Camera Display',
    section: 'cameras',
    hotkey: HOTKEYS.cycleCameraDisplay.keys,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="6" width="13" height="12" rx="2" />
        <path d="M15 10l7-4v12l-7-4z" />
      </svg>
    ),
  },
  {
    id: 'cycleMatchesDisplay',
    label: 'Matches',
    section: 'cameras',
    hotkey: HOTKEYS.cycleMatchesDisplay.keys,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="6" cy="6" r="3" />
        <circle cx="18" cy="18" r="3" />
        <path d="M8.5 8.5l7 7" strokeDasharray="2 2" />
      </svg>
    ),
  },
  {
    id: 'cycleSelectionColor',
    label: 'Selection Color',
    section: 'cameras',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 2" />
        <circle cx="12" cy="12" r="4" fill="currentColor" opacity="0.3" />
      </svg>
    ),
  },
  {
    id: 'deselectAll',
    label: 'Deselect All',
    section: 'cameras',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 9l6 6M15 9l-6 6" />
      </svg>
    ),
  },
  {
    id: 'flyToSelected',
    label: 'Fly to Selected',
    section: 'cameras',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 2L11 13" />
        <path d="M22 2l-7 20-4-9-9-4 20-7z" />
      </svg>
    ),
  },
  {
    id: 'toggleImagePlanes',
    label: 'Image Planes',
    section: 'cameras',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="14" rx="2" />
        <circle cx="8" cy="8" r="2" />
        <path d="M21 15l-5-5L5 17" />
      </svg>
    ),
  },
  // Transform section
  {
    id: 'toggleGizmo',
    label: 'Transform Gizmo',
    section: 'transform',
    hotkey: HOTKEYS.toggleGizmo.keys,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="3" x2="12" y2="21" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <polyline points="9 5 12 3 15 5" />
        <polyline points="9 19 12 21 15 19" />
        <polyline points="5 9 3 12 5 15" />
        <polyline points="19 9 21 12 19 15" />
      </svg>
    ),
  },
  {
    id: 'onePointOrigin',
    label: '1-Point Origin',
    section: 'transform',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="4" fill="currentColor" />
        <path d="M12 2v6M12 16v6M2 12h6M16 12h6" strokeDasharray="2 2" />
      </svg>
    ),
  },
  {
    id: 'twoPointScale',
    label: '2-Point Scale',
    section: 'transform',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="5" cy="12" r="3" />
        <circle cx="19" cy="12" r="3" />
        <path d="M8 12h8" strokeDasharray="2 2" />
      </svg>
    ),
  },
  {
    id: 'threePointAlign',
    label: '3-Point Align',
    section: 'transform',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        {/* Triangle connecting the 3 points */}
        <path d="M12 5L5 19L19 19Z" fill="currentColor" opacity="0.15" />
        <path d="M12 5L5 19L19 19Z" />
        {/* 3 circles at vertices */}
        <circle cx="12" cy="5" r="2" fill="currentColor" />
        <circle cx="5" cy="19" r="2" fill="currentColor" />
        <circle cx="19" cy="19" r="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'resetTransform',
    label: 'Reset Transform',
    section: 'transform',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </svg>
    ),
  },
  {
    id: 'applyTransform',
    label: 'Apply Transform',
    section: 'transform',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    ),
  },
  {
    id: 'reloadData',
    label: 'Reload Data',
    section: 'transform',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        {/* Top arc with arrow */}
        <path d="M20 12a8 8 0 0 0-8-8" />
        <path d="M12 1l-3 3 3 3" />
        {/* Bottom arc with arrow */}
        <path d="M4 12a8 8 0 0 0 8 8" />
        <path d="M12 23l3-3-3-3" />
      </svg>
    ),
  },
  // Export section
  {
    id: 'takeScreenshot',
    label: 'Screenshot',
    section: 'export',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
  },
  {
    id: 'exportPLY',
    label: 'Export PLY',
    section: 'export',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <path d="M7 10l5 5 5-5" />
        <path d="M12 15V3" />
      </svg>
    ),
  },
  {
    id: 'exportConfig',
    label: 'Export Config',
    section: 'export',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M12 18v-6" />
        <path d="M9 15l3 3 3-3" />
      </svg>
    ),
  },
  // Navigation section
  {
    id: 'togglePointerLock',
    label: 'Pointer Lock',
    section: 'view',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
      </svg>
    ),
  },
  {
    id: 'flySpeedUp',
    label: 'Fly Speed +',
    section: 'view',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
  },
  {
    id: 'flySpeedDown',
    label: 'Fly Speed -',
    section: 'view',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" opacity="0.4" />
      </svg>
    ),
  },
  // Menu section (always at bottom, not configurable)
  {
    id: 'editMenu',
    label: 'Edit Menu...',
    section: 'menu',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
  },
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
  const [showEditPopup, setShowEditPopup] = useState(false);
  const [adjustedPosition, setAdjustedPosition] = useState<{ x: number; y: number } | null>(null);

  // Context menu state
  const contextMenuPosition = useUIStore((s) => s.contextMenuPosition);
  const contextMenuActions = useUIStore((s) => s.contextMenuActions);
  const closeContextMenu = useUIStore((s) => s.closeContextMenu);
  const addContextMenuAction = useUIStore((s) => s.addContextMenuAction);
  const removeContextMenuAction = useUIStore((s) => s.removeContextMenuAction);

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

  // Point cloud store
  const colorMode = usePointCloudStore((s) => s.colorMode);
  const setColorMode = usePointCloudStore((s) => s.setColorMode);
  const pointSize = usePointCloudStore((s) => s.pointSize);
  const setPointSize = usePointCloudStore((s) => s.setPointSize);
  const minTrackLength = usePointCloudStore((s) => s.minTrackLength);
  const setMinTrackLength = usePointCloudStore((s) => s.setMinTrackLength);

  const resetTransform = useTransformStore((s) => s.resetTransform);
  const applyToData = useTransformStore((s) => s.applyToData);
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
      case 'toggleGizmo': {
        const modes = ['off', 'global', 'local'] as const;
        const currentIndex = modes.indexOf(gizmoMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        setGizmoMode(modes[nextIndex]);
        break;
      }
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
        setShowEditPopup(true);
        break;
    }
    // Only close menu for non-toggle actions (editMenu opens popup instead)
    if (!toggleActions.includes(actionId) && actionId !== 'editMenu') {
      closeContextMenu();
    }
  }, [
    resetView, setView, cameraProjection, setCameraProjection, cameraMode, setCameraMode,
    horizonLock, setHorizonLock, autoRotateMode, setAutoRotateMode,
    backgroundColor, setBackgroundColor, axesDisplayMode, setAxesDisplayMode,
    axesCoordinateSystem, setAxesCoordinateSystem, axisLabelMode, setAxisLabelMode,
    frustumColorMode, setFrustumColorMode, toggleGalleryCollapsed, colorMode, setColorMode,
    pointSize, setPointSize, minTrackLength, setMinTrackLength,
    cameraDisplayMode, setCameraDisplayMode, matchesDisplayMode, setMatchesDisplayMode,
    selectionColorMode, setSelectionColorMode, selectedImageId, setSelectedImageId, flyToImage,
    gizmoMode, setGizmoMode, pickingMode, setPickingMode, resetTransform, applyToData,
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
    setShowEditPopup(false);
    closeContextMenu();
  }, [closeContextMenu]);

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
          <div className="flex gap-4">
            {columns.map((colActions, colIndex) => (
              <div key={colIndex} className="flex-1">
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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
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
              className="w-full px-3 py-1.5 bg-ds-accent text-ds-void rounded text-sm hover:opacity-90 transition-opacity"
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
