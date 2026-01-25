/**
 * Toolbar icons for the 3D viewer control panel.
 */

import type { IconProps } from './types';

// Screenshot icon (camera)
export function ScreenshotIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

// Export/download icon
export function ExportIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

// Transform icon - cross with 4 arrow heads
export function TransformIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <polyline points="9 5 12 3 15 5" />
      <polyline points="9 19 12 21 15 19" />
      <polyline points="5 9 3 12 5 15" />
      <polyline points="19 9 21 12 19 15" />
    </svg>
  );
}

// Camera frustum icon (video camera)
export function FrustumIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="6" width="13" height="12" rx="2" />
      <path d="M15 10l7-4v12l-7-4z" />
    </svg>
  );
}

// Arrow icon for camera direction indicator
export function ArrowIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M19 12l-6-6M19 12l-6 6" />
    </svg>
  );
}

// Camera off icon
export function CameraOffIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="6" width="13" height="12" rx="2" />
      <path d="M15 10l7-4v12l-7-4z" />
      <path d="M3 21L21 3" strokeWidth="2.5" />
    </svg>
  );
}

// Image icon (camera + image frame)
export function ImageIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="1" y="1" width="7" height="5" rx="1" strokeWidth="1.5" />
      <path d="M8 2.5l3-1.5v6l-3-1.5z" strokeWidth="1.5" />
      <rect x="8" y="8" width="14" height="14" rx="1" />
      <circle cx="12" cy="12" r="1.5" />
      <path d="M22 18l-4-4-6 8" />
    </svg>
  );
}

// Matches off icon (two cameras, no line)
export function MatchOffIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="1" width="7" height="5" rx="1" />
      <path d="M8 2.5l3-1.5v6l-3-1.5z" />
      <rect x="13" y="17" width="7" height="5" rx="1" />
      <path d="M20 18.5l3-1.5v6l-3-1.5z" />
    </svg>
  );
}

// Matches on icon (two cameras, solid line)
export function MatchOnIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="1" width="7" height="5" rx="1" />
      <path d="M8 2.5l3-1.5v6l-3-1.5z" />
      <rect x="13" y="17" width="7" height="5" rx="1" />
      <path d="M20 18.5l3-1.5v6l-3-1.5z" />
      <path d="M9 6l6 12" strokeWidth="2" />
    </svg>
  );
}

// Matches blink icon (two cameras, dotted line)
export function MatchBlinkIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="1" width="7" height="5" rx="1" />
      <path d="M8 2.5l3-1.5v6l-3-1.5z" />
      <rect x="13" y="17" width="7" height="5" rx="1" />
      <path d="M20 18.5l3-1.5v6l-3-1.5z" />
      <path d="M9 6l6 12" strokeWidth="2" strokeDasharray="2 2" />
    </svg>
  );
}

// Rainbow icon (camera + rainbow arcs)
export function RainbowIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeLinecap="round">
      <rect x="1" y="1" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 2.5l3-1.5v6l-3-1.5z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 19a7 7 0 0 1 14 0" stroke="#FF00FF" strokeWidth="2.5" />
      <path d="M12 19a5 5 0 0 1 10 0" stroke="#FFFF00" strokeWidth="2.5" />
      <path d="M14 19a3 3 0 0 1 6 0" stroke="#00FFFF" strokeWidth="2.5" />
    </svg>
  );
}

// Selection color off icon
export function SelectionOffIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="1" y="1" width="7" height="5" rx="1" strokeWidth="1.5" />
      <path d="M8 2.5l3-1.5v6l-3-1.5z" strokeWidth="1.5" />
      <circle cx="17" cy="17" r="6" fill="none" />
    </svg>
  );
}

// Selection static icon
export function SelectionStaticIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeWidth="1.5">
      <rect x="1" y="1" width="7" height="5" rx="1" stroke="currentColor" />
      <path d="M8 2.5l3-1.5v6l-3-1.5z" stroke="currentColor" />
      <circle cx="17" cy="17" r="6" fill="#FF00FF" />
    </svg>
  );
}

// Selection blink icon
export function SelectionBlinkIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeWidth="1.5">
      <rect x="1" y="1" width="7" height="5" rx="1" stroke="currentColor" />
      <path d="M8 2.5l3-1.5v6l-3-1.5z" stroke="currentColor" />
      <circle cx="17" cy="17" r="2.5" fill="#FF00FF" />
      <circle cx="17" cy="17" r="4.5" stroke="#FF00FF" strokeWidth="1.5" opacity="0.6" fill="none" />
      <circle cx="17" cy="17" r="6" stroke="#FF00FF" strokeWidth="1" opacity="0.3" fill="none" />
    </svg>
  );
}

// Axes icon (colored XYZ)
export function AxesIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">
      <path d="M12 12h9" stroke="#e74c3c" />
      <path d="M12 12v-9" stroke="#2ecc71" />
      <path d="M12 12l-6 6" stroke="#3498db" />
    </svg>
  );
}

// Axes off icon
export function AxesOffIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeLinecap="round">
      <path d="M12 12h4" stroke="currentColor" strokeWidth="2" opacity="0.35" />
      <path d="M12 12v-4" stroke="currentColor" strokeWidth="2" opacity="0.35" />
      <path d="M12 12l-2.5 2.5" stroke="currentColor" strokeWidth="2" opacity="0.35" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

// Grid icon
export function GridIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 8h18M3 16h18M8 3v18M16 3v18" />
    </svg>
  );
}

// Combined Axes + Grid icon
export function AxesGridIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeLinecap="round">
      <path d="M4 8h16M4 16h16M8 4v16M16 4v16" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <path d="M12 12h9" stroke="#e74c3c" strokeWidth="2.5" />
      <path d="M12 12v-9" stroke="#2ecc71" strokeWidth="2.5" />
      <path d="M12 12l-6 6" stroke="#3498db" strokeWidth="2.5" />
    </svg>
  );
}

// Color mode icons
export function ColorOffIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="7" r="2.5" fill="currentColor" opacity="0.3" />
      <circle cx="7" cy="12" r="2.2" fill="currentColor" opacity="0.3" />
      <circle cx="17" cy="11" r="2.3" fill="currentColor" opacity="0.3" />
      <circle cx="9" cy="17" r="2" fill="currentColor" opacity="0.3" />
      <circle cx="15" cy="16" r="1.8" fill="currentColor" opacity="0.3" />
      <circle cx="5" cy="7" r="1.5" fill="currentColor" opacity="0.3" />
      <circle cx="19" cy="6" r="1.3" fill="currentColor" opacity="0.3" />
      <path d="M3 21L21 3" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

export function ColorRgbIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
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
    <svg className={className} viewBox="0 0 24 24" fill="none">
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
    <svg className={className} viewBox="0 0 24 24" fill="none">
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

// Background toggle icon
export function BgIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18" />
      <path d="M12 3a9 9 0 0 0 0 18" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

// View icon - eye for viewing/camera options
export function ViewIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// Image loading icons
export function PrefetchIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="1" width="11" height="7" rx="1" strokeWidth="1.5" />
      <rect x="0" y="4" width="11" height="7" rx="1" fill="currentColor" strokeWidth="1.5" />
      <path d="M17 10v8M17 18l-3-3M17 18l3-3" />
      <path d="M12 22h10" />
    </svg>
  );
}

export function LazyIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="1" width="11" height="7" rx="1" strokeWidth="1.5" />
      <rect x="0" y="4" width="11" height="7" rx="1" fill="currentColor" strokeWidth="1.5" />
      <circle cx="17" cy="17" r="5.5" />
      <path d="M17 14v3.5l2 1.5" />
    </svg>
  );
}

export function SkipIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="1" width="11" height="7" rx="1" strokeWidth="1.5" />
      <rect x="0" y="4" width="11" height="7" rx="1" fill="currentColor" strokeWidth="1.5" />
      <circle cx="17" cy="17" r="5.5" />
      <path d="M14 14l6 6M20 14l-6 6" />
    </svg>
  );
}

// Camera mode icons
export function OrbitIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
      <circle cx="21" cy="12" r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FlyIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2.5 12 Q12 2 21.5 12 Q12 22 2.5 12" />
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Sidebar icons
export function SidebarExpandIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="15" y1="3" x2="15" y2="21" />
      <polyline points="11 9 7 12 11 15" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SidebarCollapseIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="15" y1="3" x2="15" y2="21" />
      <polyline points="7 9 11 12 7 15" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Rig icon - 3 camera frustums in triangle with connecting lines
export function RigIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      {/* Top camera frustum */}
      <rect x="8" y="1" width="5" height="4" rx="0.5" />
      <path d="M13 2.5l2.5-1v4l-2.5-1z" />
      {/* Bottom-left camera frustum */}
      <rect x="1" y="16" width="5" height="4" rx="0.5" />
      <path d="M6 17.5l2.5-1v4l-2.5-1z" />
      {/* Bottom-right camera frustum */}
      <rect x="15" y="16" width="5" height="4" rx="0.5" />
      <path d="M20 17.5l2.5-1v4l-2.5-1z" />
      {/* Connecting lines forming triangle */}
      <line x1="10" y1="5" x2="4" y2="16" strokeWidth="1.5" />
      <line x1="11" y1="5" x2="17" y2="16" strokeWidth="1.5" />
      <line x1="6" y1="18" x2="15" y2="18" strokeWidth="1.5" />
    </svg>
  );
}

// Rig off icon - 3 camera frustums with strike-through
export function RigOffIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      {/* Top camera frustum */}
      <rect x="8" y="1" width="5" height="4" rx="0.5" />
      <path d="M13 2.5l2.5-1v4l-2.5-1z" />
      {/* Bottom-left camera frustum */}
      <rect x="1" y="16" width="5" height="4" rx="0.5" />
      <path d="M6 17.5l2.5-1v4l-2.5-1z" />
      {/* Bottom-right camera frustum */}
      <rect x="15" y="16" width="5" height="4" rx="0.5" />
      <path d="M20 17.5l2.5-1v4l-2.5-1z" />
      {/* Strike-through */}
      <path d="M2 22L22 2" strokeWidth="2.5" />
    </svg>
  );
}

// Rig blink icon - 3 camera frustums with dotted connecting lines
export function RigBlinkIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      {/* Top camera frustum */}
      <rect x="8" y="1" width="5" height="4" rx="0.5" />
      <path d="M13 2.5l2.5-1v4l-2.5-1z" />
      {/* Bottom-left camera frustum */}
      <rect x="1" y="16" width="5" height="4" rx="0.5" />
      <path d="M6 17.5l2.5-1v4l-2.5-1z" />
      {/* Bottom-right camera frustum */}
      <rect x="15" y="16" width="5" height="4" rx="0.5" />
      <path d="M20 17.5l2.5-1v4l-2.5-1z" />
      {/* Dotted connecting lines forming triangle */}
      <line x1="10" y1="5" x2="4" y2="16" strokeWidth="1.5" strokeDasharray="2 2" />
      <line x1="11" y1="5" x2="17" y2="16" strokeWidth="1.5" strokeDasharray="2 2" />
      <line x1="6" y1="18" x2="15" y2="18" strokeWidth="1.5" strokeDasharray="2 2" />
    </svg>
  );
}

// Floor detect icon - tilted square (floor plane) with arrow pointing up (normal)
export function FloorDetectIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      {/* Tilted square representing the floor plane in perspective */}
      <path d="M3 16 L12 20 L21 16 L12 12 Z" strokeLinejoin="round" />
      {/* Arrow pointing up from center (the floor normal) */}
      <line x1="12" y1="16" x2="12" y2="4" strokeWidth="2" />
      <polyline points="8 8 12 4 16 8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
