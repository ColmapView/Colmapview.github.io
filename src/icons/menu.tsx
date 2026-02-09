/**
 * Context menu action icons.
 * Used in GlobalContextMenu and gizmo context menus.
 */

import type { ReactElement } from 'react';
import { ICON_COLORS } from '../theme/colors';

// Menu icon type - returns ReactElement for direct use in ACTIONS array
export type MenuIcon = ReactElement;

// View section icons
export const ViewPosXIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 12h6" stroke={ICON_COLORS.axisX} strokeWidth="3" />
    <path d="M15 9l3 3-3 3" stroke={ICON_COLORS.axisX} />
  </svg>
);

export const ViewPosYIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 12v-6" stroke={ICON_COLORS.axisY} strokeWidth="3" />
    <path d="M9 9l3-3 3 3" stroke={ICON_COLORS.axisY} />
  </svg>
);

export const ViewPosZIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3" fill={ICON_COLORS.axisZ} />
    <path d="M12 12l4 4" stroke={ICON_COLORS.axisZ} strokeWidth="2" />
  </svg>
);

export const ProjectionIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M2 12h4M18 12h4" />
    <rect x="6" y="4" width="12" height="16" rx="1" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const CameraModeIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);

export const HorizonLockIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 12h18" />
    <path d="M12 3v6M12 15v6" />
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
  </svg>
);

export const AutoRotateIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="2" x2="12" y2="22" strokeDasharray="2 2" />
    <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" strokeDasharray="42 21" />
    <path d="M2 12l0 3.5 3.5 -0.5" />
  </svg>
);

// Display section icons
export const GalleryPanelIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="15" y1="3" x2="15" y2="21" />
  </svg>
);

export const CoordSystemIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 3v18M3 12h18" />
    <path d="M12 12l6-6" strokeDasharray="2 2" />
  </svg>
);

export const FrustumColorIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="6" width="13" height="12" rx="2" />
    <path d="M15 10l7-4v12l-7-4z" />
    <circle cx="7" cy="12" r="1.5" fill={ICON_COLORS.axisX} stroke="none" />
    <circle cx="11" cy="12" r="1.5" fill={ICON_COLORS.axisY} stroke="none" />
  </svg>
);

export const PointColorIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="7" cy="12" r="3" fill={ICON_COLORS.axisX} stroke="none" />
    <circle cx="12" cy="12" r="3" fill={ICON_COLORS.axisY} stroke="none" />
    <circle cx="17" cy="12" r="3" fill={ICON_COLORS.axisZ} stroke="none" />
  </svg>
);

// Cameras section icons
export const MatchesIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="6" cy="6" r="3" />
    <circle cx="18" cy="18" r="3" />
    <path d="M8.5 8.5l7 7" strokeDasharray="2 2" />
  </svg>
);

export const SelectionColorIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 2" />
    <circle cx="12" cy="12" r="4" fill="currentColor" opacity="0.3" />
  </svg>
);

export const DeselectAllIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 9l6 6M15 9l-6 6" />
  </svg>
);

export const ImagePlanesIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="14" rx="2" />
    <circle cx="8" cy="8" r="2" />
    <path d="M21 15l-5-5L5 17" />
  </svg>
);

export const UndistortIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    {/* Curved distorted lines becoming straight */}
    <path d="M4 6q8 3 16 0" strokeDasharray="2 2" opacity="0.5" />
    <path d="M4 12h16" />
    <path d="M4 18q8 -3 16 0" strokeDasharray="2 2" opacity="0.5" />
    {/* Arrow indicating correction */}
    <path d="M12 8v-4M10 6l2-2 2 2" strokeWidth="1.5" />
  </svg>
);

// Transform section icons

export const CenterOriginIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    {/* Crosshair at center */}
    <circle cx="12" cy="12" r="8" strokeDasharray="4 2" />
    <path d="M12 4v4M12 16v4M4 12h4M16 12h4" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </svg>
);
export const OnePointOriginIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="4" fill="currentColor" />
    <path d="M12 2v6M12 16v6M2 12h6M16 12h6" strokeDasharray="2 2" />
  </svg>
);

export const TwoPointScaleIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="5" cy="12" r="3" />
    <circle cx="19" cy="12" r="3" />
    <path d="M8 12h8" strokeDasharray="2 2" />
  </svg>
);

export const ThreePointAlignIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5L5 19L19 19Z" fill="currentColor" opacity="0.15" />
    <path d="M12 5L5 19L19 19Z" />
    <circle cx="12" cy="5" r="2" fill="currentColor" />
    <circle cx="5" cy="19" r="2" fill="currentColor" />
    <circle cx="19" cy="19" r="2" fill="currentColor" />
  </svg>
);

// Export section icons
export const ExportPLYIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </svg>
);

export const ExportConfigIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M12 18v-6" />
    <path d="M9 15l3 3 3-3" />
  </svg>
);

// Delete images (trash can)
export const DeleteImagesIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
    <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);

// Floor detection (horizontal plane with arrow)
export const FloorDetectionIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M2 20l10-6 10 6" />
    <path d="M12 14V4" />
    <path d="M9 7l3-3 3 3" />
  </svg>
);

// Camera conversion (camera with arrows)
export const CameraConvertIcon: MenuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);
