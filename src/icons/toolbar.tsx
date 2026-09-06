/**
 * Toolbar icons for the 3D viewer control panel.
 */

import type { IconProps } from './types';
import { ICON_COLORS } from '../theme/colors';

// Screenshot icon (camera)
export function ScreenshotIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M8 6l1.5-2h5L16 6h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

// Export/download icon
export function ExportIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

// Transform icon - cross with 4 arrow heads
export function TransformIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <polyline points="9 5 12 3 15 5" />
      <polyline points="9 19 12 21 15 19" />
      <polyline points="5 9 3 12 5 15" />
      <polyline points="19 9 21 12 19 15" />
    </svg>
  );
}

// Align icon - three picked points spanning a plane above an origin corner
export function AlignIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {/* Origin corner the picked geometry gets aligned to */}
      <path d="M3 21h7" />
      <path d="M3 21v-7" />
      {/* Plane spanned by the picked points */}
      <path d="M7 12l7-4 7 4-7 4z" opacity="0.55" />
      {/* The picked points themselves */}
      <circle cx="7" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="14" cy="8" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="21" cy="12" r="1.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Camera frustum icon (video camera)
export function FrustumIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="6" width="12" height="12" rx="2" />
      <path d="M15 10l6-3v10l-6-3" />
    </svg>
  );
}

// Arrow icon for camera direction indicator
export function ArrowIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M19 12l-6-6M19 12l-6 6" />
    </svg>
  );
}

// Camera off icon
export function CameraOffIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="6" width="12" height="12" rx="2" />
      <path d="M15 10l6-3v10l-6-3" />
      <path d="M4 20L20 4" />
    </svg>
  );
}

// Image planes: a single frame remains legible at toolbar size.
export function ImageIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8" cy="9" r="1.5" fill="currentColor" stroke="none" />
      <path d="M4 17l5-5 4 4 3-3 5 5" />
    </svg>
  );
}

// Matches: stable paired frames with absent, solid, or dotted connection.
export function MatchOffIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="15" y="15" width="6" height="6" rx="1.5" />
    </svg>
  );
}

// Matches on icon (paired frames, solid line)
export function MatchOnIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="15" y="15" width="6" height="6" rx="1.5" />
      <path d="M9 9l6 6" />
    </svg>
  );
}

// Matches blink icon (paired frames, dotted line)
export function MatchBlinkIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="15" y="15" width="6" height="6" rx="1.5" />
      <path d="M9 9l6 6" strokeDasharray="1 3" />
    </svg>
  );
}

// Camera color mode: compact RGB swatch within a neutral camera silhouette.
export function RainbowIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="6" width="12" height="12" rx="2" />
      <path d="M15 10l6-3v10l-6-3" />
      <path d="M6 12h2" stroke="#e74c3c" strokeWidth="3" strokeLinecap="butt" />
      <path d="M8 12h2" stroke="#2ecc71" strokeWidth="3" strokeLinecap="butt" />
      <path d="M10 12h2" stroke="#3498db" strokeWidth="3" strokeLinecap="butt" />
    </svg>
  );
}

// Selection color off icon
export function SelectionOffIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M8 4H5a1 1 0 0 0-1 1v3m12-4h3a1 1 0 0 1 1 1v3M4 16v3a1 1 0 0 0 1 1h3m8 0h3a1 1 0 0 0 1-1v-3" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

// Selection static icon
export function SelectionStaticIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M8 4H5a1 1 0 0 0-1 1v3m12-4h3a1 1 0 0 1 1 1v3M4 16v3a1 1 0 0 0 1 1h3m8 0h3a1 1 0 0 0 1-1v-3" />
      <circle cx="12" cy="12" r="2.5" fill="#FF00FF" stroke="none" />
    </svg>
  );
}

// Selection blink icon
export function SelectionBlinkIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M8 4H5a1 1 0 0 0-1 1v3m12-4h3a1 1 0 0 1 1 1v3M4 16v3a1 1 0 0 0 1 1h3m8 0h3a1 1 0 0 0 1-1v-3" />
      <circle cx="12" cy="12" r="2.5" fill="#FF00FF" stroke="none" />
      <path d="M12 6v1m5 5h1m-6 5v1m-6-6h1" />
    </svg>
  );
}

// Axes icon (colored XYZ)
export function AxesIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true" focusable="false" strokeLinejoin="round">
      <path d="M12 12h9" stroke={ICON_COLORS.axisX} />
      <path d="M12 12v-9" stroke={ICON_COLORS.axisY} />
      <path d="M12 12l-6 6" stroke={ICON_COLORS.axisZ} />
    </svg>
  );
}

// Axes off icon
export function AxesOffIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeLinecap="round" aria-hidden="true" focusable="false" strokeLinejoin="round">
      <path d="M12 12h4" stroke="currentColor" strokeWidth="1.75" opacity="0.35" />
      <path d="M12 12v-4" stroke="currentColor" strokeWidth="1.75" opacity="0.35" />
      <path d="M12 12l-2.5 2.5" stroke="currentColor" strokeWidth="1.75" opacity="0.35" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

// Grid icon
export function GridIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h18M3 16h18M8 3v18M16 3v18" />
    </svg>
  );
}

// Combined Axes + Grid icon
export function AxesGridIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeLinecap="round" aria-hidden="true" focusable="false" strokeLinejoin="round">
      <path d="M4 8h16M4 16h16M8 4v16M16 4v16" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <path d="M12 12h9" stroke={ICON_COLORS.axisX} strokeWidth="1.75" />
      <path d="M12 12v-9" stroke={ICON_COLORS.axisY} strokeWidth="1.75" />
      <path d="M12 12l-6 6" stroke={ICON_COLORS.axisZ} strokeWidth="1.75" />
    </svg>
  );
}

// Color mode icons
export function ColorOffIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="7" r="2.5" fill="currentColor" opacity="0.3" />
      <circle cx="7" cy="12" r="2.2" fill="currentColor" opacity="0.3" />
      <circle cx="17" cy="11" r="2.3" fill="currentColor" opacity="0.3" />
      <circle cx="9" cy="17" r="2" fill="currentColor" opacity="0.3" />
      <circle cx="15" cy="16" r="1.8" fill="currentColor" opacity="0.3" />
      <circle cx="5" cy="7" r="1.5" fill="currentColor" opacity="0.3" />
      <circle cx="19" cy="6" r="1.3" fill="currentColor" opacity="0.3" />
      <path d="M3 21L21 3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

export function ColorRgbIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="7" r="2.5" fill="#e74c3c" />
      <circle cx="7" cy="12" r="2.2" fill="#3498db" />
      <circle cx="17" cy="11" r="2.3" fill="#2ecc71" />
      <circle cx="9" cy="17" r="2" fill="#f39c12" />
      <circle cx="15" cy="16" r="1.8" fill="#9b59b6" />
      <circle cx="5" cy="7" r="1.5" fill="#1abc9c" />
      <circle cx="19" cy="6" r="1.3" fill="#e91e63" />
    </svg>
  );
}

export function ColorErrorIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="7" r="2.5" fill="#e74c3c" />
      <circle cx="7" cy="12" r="2.2" fill="#3498db" />
      <circle cx="17" cy="11" r="2.3" fill="#f39c12" />
      <circle cx="9" cy="17" r="2" fill="#2980b9" />
      <circle cx="15" cy="16" r="1.8" fill="#c0392b" />
      <circle cx="5" cy="7" r="1.5" fill="#1e90ff" />
      <circle cx="19" cy="6" r="1.3" fill="#ff6347" />
    </svg>
  );
}

export function ColorTrackIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="7" r="2.5" fill="#2ecc71" />
      <circle cx="7" cy="12" r="2.2" fill="#145a32" />
      <circle cx="17" cy="11" r="2.3" fill="#27ae60" />
      <circle cx="9" cy="17" r="2" fill="#1e8449" />
      <circle cx="15" cy="16" r="1.8" fill="#0b5345" />
      <circle cx="5" cy="7" r="1.5" fill="#58d68d" />
      <circle cx="19" cy="6" r="1.3" fill="#196f3d" />
    </svg>
  );
}

/**
 * Splat-blob icon art.
 *
 * DELIBERATE EXEMPTION from the ds palette. The hexes below (#f472b6, #60a5fa,
 * #facc15, plus the rainbow points) are ILLUSTRATIVE, not semantic: three
 * overlapping anisotropic blobs in three different hues is what makes a 24px
 * glyph read as "gaussian splats" rather than as a generic cloud. The colour
 * carries the icon's meaning, so routing it through --success/--info/--warning
 * would both misuse status tokens and destroy the thing the icon depicts —
 * greyed to one hue, these are three ellipses.
 *
 * They are also not on any surface the palette governs: each blob is drawn at
 * 0.18/0.34/0.6 opacity over the toolbar button, so they read as tinted
 * translucency, never as a flat brand colour. Same reasoning as
 * LINK_COLORS in src/theme/colors.ts — scoped exemption, stated in place.
 */
interface SplatBlobProps {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotation: number;
  color: string;
}

function SplatBlob({ cx, cy, rx, ry, rotation, color }: SplatBlobProps) {
  const transform = `rotate(${rotation} ${cx} ${cy})`;

  return (
    <g transform={transform}>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={color} opacity="0.18" />
      <ellipse cx={cx} cy={cy} rx={rx * 0.64} ry={ry * 0.64} fill={color} opacity="0.34" />
      <ellipse cx={cx} cy={cy} rx={rx * 0.34} ry={ry * 0.34} fill={color} opacity="0.6" />
    </g>
  );
}

export function ColorSplatIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      <SplatBlob cx={8.2} cy={9.5} rx={5.6} ry={3.4} rotation={-28} color="#f472b6" />
      <SplatBlob cx={15.4} cy={8.2} rx={4.8} ry={3.1} rotation={22} color="#60a5fa" />
      <SplatBlob cx={13.8} cy={15.4} rx={5.8} ry={3.7} rotation={-12} color="#facc15" />
      <ellipse cx="11.8" cy="12" rx="7.7" ry="5.1" fill="#f8fafc" opacity="0.08" />
    </svg>
  );
}

export function ColorSplatPointsIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      <SplatBlob cx={8.2} cy={9.5} rx={5.6} ry={3.4} rotation={-28} color="#f472b6" />
      <SplatBlob cx={15.4} cy={8.2} rx={4.8} ry={3.1} rotation={22} color="#60a5fa" />
      <SplatBlob cx={13.8} cy={15.4} rx={5.8} ry={3.7} rotation={-12} color="#facc15" />
      <circle cx="7.2" cy="7.6" r="1.15" fill="#ff00ff" />
      <circle cx="7.2" cy="7.6" r="2" stroke="#ff00ff" strokeWidth="0.9" opacity="0.45" />
      <circle cx="17.3" cy="10.6" r="1.15" fill="#ff00ff" />
      <circle cx="17.3" cy="10.6" r="2" stroke="#ff00ff" strokeWidth="0.9" opacity="0.45" />
      <circle cx="11" cy="17.2" r="1.15" fill="#ff00ff" />
      <circle cx="11" cy="17.2" r="2" stroke="#ff00ff" strokeWidth="0.9" opacity="0.45" />
    </svg>
  );
}

export function ColorSplatRainbowPointsIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      <SplatBlob cx={8.2} cy={9.5} rx={5.6} ry={3.4} rotation={-28} color="#f472b6" />
      <SplatBlob cx={15.4} cy={8.2} rx={4.8} ry={3.1} rotation={22} color="#60a5fa" />
      <SplatBlob cx={13.8} cy={15.4} rx={5.8} ry={3.7} rotation={-12} color="#facc15" />
      <circle cx="6.4" cy="7.3" r="1.2" fill="#ef4444" />
      <circle cx="14.4" cy="6.9" r="1.2" fill="#facc15" />
      <circle cx="18" cy="12" r="1.2" fill="#22c55e" />
      <circle cx="13.1" cy="17.6" r="1.2" fill="#38bdf8" />
      <circle cx="7.6" cy="15.2" r="1.2" fill="#a855f7" />
    </svg>
  );
}

// Background toggle icon
export function BgIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18" />
      <path d="M12 3a9 9 0 0 0 0 18" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

// View icon - eye for viewing/camera options
export function ViewIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// Image loading icons
export function PrefetchIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M6 3h11a1 1 0 0 1 1 1v5" />
      <rect x="3" y="6" width="12" height="9" rx="1.5" />
      <path d="M17 12v8m-3-3 3 3 3-3" />
    </svg>
  );
}

export function LazyIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M6 3h11a1 1 0 0 1 1 1v5" />
      <rect x="3" y="6" width="12" height="9" rx="1.5" />
      <circle cx="17" cy="17" r="4" />
      <path d="M17 15v2l1.5 1" />
    </svg>
  );
}

export function SkipIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M6 3h11a1 1 0 0 1 1 1v5" />
      <rect x="3" y="6" width="12" height="9" rx="1.5" />
      <circle cx="17" cy="17" r="4" />
      <path d="M15.5 15.5l3 3m0-3-3 3" />
    </svg>
  );
}

// Camera mode icons
export function OrbitIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="20" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FlyIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 12 Q12 2 21.5 12 Q12 22 2.5 12" />
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Sidebar icons
export function SidebarExpandIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="15" y1="3" x2="15" y2="21" />
      <polyline points="11 9 7 12 11 15" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SidebarCollapseIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="15" y1="3" x2="15" y2="21" />
      <polyline points="7 9 11 12 7 15" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Rig: three camera frames in a triangle; simplified for small sizes.
export function RigIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="9" y="3" width="6" height="5" rx="1" />
      <rect x="2" y="16" width="6" height="5" rx="1" />
      <rect x="16" y="16" width="6" height="5" rx="1" />
      <path d="M10 8l-4 8m8-8 4 8M8 19h8" />
    </svg>
  );
}

// Rig off icon - camera frames with strike-through
export function RigOffIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="9" y="3" width="6" height="5" rx="1" />
      <rect x="2" y="16" width="6" height="5" rx="1" />
      <rect x="16" y="16" width="6" height="5" rx="1" />
      <path d="M4 21L20 3" />
    </svg>
  );
}

// Rig blink icon - camera frames with dotted connecting lines
export function RigBlinkIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="9" y="3" width="6" height="5" rx="1" />
      <rect x="2" y="16" width="6" height="5" rx="1" />
      <rect x="16" y="16" width="6" height="5" rx="1" />
      <path d="M10 8l-4 8m8-8 4 8M8 19h8" strokeDasharray="1 3" />
    </svg>
  );
}

// Floor detect icon - tilted square (floor plane) with arrow pointing up (normal)
export function FloorDetectIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      {/* Tilted square representing the floor plane in perspective */}
      <path d="M3 16 L12 20 L21 16 L12 12 Z" strokeLinejoin="round" />
      {/* Arrow pointing up from center (the floor normal) */}
      <line x1="12" y1="16" x2="12" y2="4" strokeWidth="1.75" />
      <polyline points="8 8 12 4 16 8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
