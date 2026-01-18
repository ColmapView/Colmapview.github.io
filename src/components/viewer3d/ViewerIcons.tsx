/**
 * Icon components for the 3D viewer controls.
 * Extracted from ViewerControls.tsx for better organization.
 */

import type { ReactNode } from 'react';

// Common prop type for icons
interface IconProps {
  className?: string;
}

// Icon wrapper that shows text abbreviation on hover (uses CSS group-hover from parent button)
export function HoverIcon({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="relative w-6 h-6 flex items-center justify-center">
      <span className="absolute inset-0 flex items-center justify-center opacity-100 group-hover:opacity-0">{icon}</span>
      <span className="absolute inset-0 flex items-center justify-center text-2xs font-bold tracking-tight opacity-0 group-hover:opacity-100">
        {label}
      </span>
    </span>
  );
}

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
      {/* Vertical line */}
      <line x1="12" y1="3" x2="12" y2="21" />
      {/* Horizontal line */}
      <line x1="3" y1="12" x2="21" y2="12" />
      {/* Up arrow head */}
      <polyline points="9 5 12 3 15 5" />
      {/* Down arrow head */}
      <polyline points="9 19 12 21 15 19" />
      {/* Left arrow head */}
      <polyline points="5 9 3 12 5 15" />
      {/* Right arrow head */}
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

export function ImageIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {/* Top-left camera (1/3) */}
      <rect x="1" y="1" width="7" height="5" rx="1" strokeWidth="1.5" />
      <path d="M8 2.5l3-1.5v6l-3-1.5z" strokeWidth="1.5" />
      {/* Image frame (2/3) - middle and bottom right */}
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
      {/* Top-left camera */}
      <rect x="1" y="1" width="7" height="5" rx="1" />
      <path d="M8 2.5l3-1.5v6l-3-1.5z" />
      {/* Bottom-right camera */}
      <rect x="13" y="17" width="7" height="5" rx="1" />
      <path d="M20 18.5l3-1.5v6l-3-1.5z" />
    </svg>
  );
}

// Matches on icon (two cameras, solid line)
export function MatchOnIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      {/* Top-left camera */}
      <rect x="1" y="1" width="7" height="5" rx="1" />
      <path d="M8 2.5l3-1.5v6l-3-1.5z" />
      {/* Bottom-right camera */}
      <rect x="13" y="17" width="7" height="5" rx="1" />
      <path d="M20 18.5l3-1.5v6l-3-1.5z" />
      {/* Solid connecting line */}
      <path d="M9 6l6 12" strokeWidth="2" />
    </svg>
  );
}

// Matches blink icon (two cameras, dotted line)
export function MatchBlinkIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      {/* Top-left camera */}
      <rect x="1" y="1" width="7" height="5" rx="1" />
      <path d="M8 2.5l3-1.5v6l-3-1.5z" />
      {/* Bottom-right camera */}
      <rect x="13" y="17" width="7" height="5" rx="1" />
      <path d="M20 18.5l3-1.5v6l-3-1.5z" />
      {/* Dotted connecting line */}
      <path d="M9 6l6 12" strokeWidth="2" strokeDasharray="2 2" />
    </svg>
  );
}

export function RainbowIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeLinecap="round">
      {/* Top-left camera (1/3) */}
      <rect x="1" y="1" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 2.5l3-1.5v6l-3-1.5z" stroke="currentColor" strokeWidth="1.5" />
      {/* Rainbow (2/3) - bottom right, 3 MYC curves */}
      <path d="M10 19a7 7 0 0 1 14 0" stroke="#FF00FF" strokeWidth="2.5" />
      <path d="M12 19a5 5 0 0 1 10 0" stroke="#FFFF00" strokeWidth="2.5" />
      <path d="M14 19a3 3 0 0 1 6 0" stroke="#00FFFF" strokeWidth="2.5" />
    </svg>
  );
}

// Selection color off icon (small camera top-left, empty circle bottom-right)
export function SelectionOffIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {/* Top-left camera (1/3) */}
      <rect x="1" y="1" width="7" height="5" rx="1" strokeWidth="1.5" />
      <path d="M8 2.5l3-1.5v6l-3-1.5z" strokeWidth="1.5" />
      {/* Empty circle bottom-right (2/3) */}
      <circle cx="17" cy="17" r="6" fill="none" />
    </svg>
  );
}

// Selection static icon (small camera top-left, solid magenta dot bottom-right)
export function SelectionStaticIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeWidth="1.5">
      {/* Top-left camera (1/3) */}
      <rect x="1" y="1" width="7" height="5" rx="1" stroke="currentColor" />
      <path d="M8 2.5l3-1.5v6l-3-1.5z" stroke="currentColor" />
      {/* Solid magenta dot bottom-right (2/3) */}
      <circle cx="17" cy="17" r="6" fill="#FF00FF" />
    </svg>
  );
}

// Selection blink icon (small camera top-left, pulsing rings bottom-right)
export function SelectionBlinkIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeWidth="1.5">
      {/* Top-left camera (1/3) */}
      <rect x="1" y="1" width="7" height="5" rx="1" stroke="currentColor" />
      <path d="M8 2.5l3-1.5v6l-3-1.5z" stroke="currentColor" />
      {/* Pulsing rings bottom-right (2/3) */}
      <circle cx="17" cy="17" r="2.5" fill="#FF00FF" />
      <circle cx="17" cy="17" r="4.5" stroke="#FF00FF" strokeWidth="1.5" opacity="0.6" fill="none" />
      <circle cx="17" cy="17" r="6" stroke="#FF00FF" strokeWidth="1" opacity="0.3" fill="none" />
    </svg>
  );
}

export function AxesIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">
      {/* X axis - red */}
      <path d="M12 12h9" stroke="#e74c3c" />
      {/* Y axis - green */}
      <path d="M12 12v-9" stroke="#2ecc71" />
      {/* Z axis - blue */}
      <path d="M12 12l-6 6" stroke="#3498db" />
    </svg>
  );
}

export function AxesOffIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeLinecap="round">
      {/* Collapsed/short axes stubs - showing "off" state */}
      <path d="M12 12h4" stroke="currentColor" strokeWidth="2" opacity="0.35" />
      <path d="M12 12v-4" stroke="currentColor" strokeWidth="2" opacity="0.35" />
      <path d="M12 12l-2.5 2.5" stroke="currentColor" strokeWidth="2" opacity="0.35" />
      {/* Center dot */}
      <circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

export function GridIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 8h18M3 16h18M8 3v18M16 3v18" />
    </svg>
  );
}

// Combined Axes + Grid icon for "both" mode
export function AxesGridIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeLinecap="round">
      {/* Grid lines (subtle, in background) */}
      <path d="M4 8h16M4 16h16M8 4v16M16 4v16" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      {/* X axis - red */}
      <path d="M12 12h9" stroke="#e74c3c" strokeWidth="2.5" />
      {/* Y axis - green */}
      <path d="M12 12v-9" stroke="#2ecc71" strokeWidth="2.5" />
      {/* Z axis - blue */}
      <path d="M12 12l-6 6" stroke="#3498db" strokeWidth="2.5" />
    </svg>
  );
}

// Color mode icons - point cloud representations with mode-specific colors
export function ColorRgbIcon({ className }: IconProps) {
  // RGB mode: show multicolored points (original colors)
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
  // Error mode: blue (low error) to red (high error) - jet colormap
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
  // Track length: dark green (few) to bright green (many observations)
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

export function BgIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18" />
      <path d="M12 3a9 9 0 0 0 0 18" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

// View icon - 3D cube suggesting viewing angles
export function ViewIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

// Image loading icons - 2 stacked rectangles top-left, modifier bottom-right
export function PrefetchIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {/* 2 stacked rectangles top-left */}
      <rect x="2" y="1" width="11" height="7" rx="1" strokeWidth="1.5" />
      <rect x="0" y="4" width="11" height="7" rx="1" fill="currentColor" strokeWidth="1.5" />
      {/* Download arrow bottom-right */}
      <path d="M17 10v8M17 18l-3-3M17 18l3-3" />
      <path d="M12 22h10" />
    </svg>
  );
}

export function LazyIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {/* 2 stacked rectangles top-left */}
      <rect x="2" y="1" width="11" height="7" rx="1" strokeWidth="1.5" />
      <rect x="0" y="4" width="11" height="7" rx="1" fill="currentColor" strokeWidth="1.5" />
      {/* Clock bottom-right */}
      <circle cx="17" cy="17" r="5.5" />
      <path d="M17 14v3.5l2 1.5" />
    </svg>
  );
}

export function SkipIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {/* 2 stacked rectangles top-left */}
      <rect x="2" y="1" width="11" height="7" rx="1" strokeWidth="1.5" />
      <rect x="0" y="4" width="11" height="7" rx="1" fill="currentColor" strokeWidth="1.5" />
      {/* X/cross bottom-right */}
      <circle cx="17" cy="17" r="5.5" />
      <path d="M14 14l6 6M20 14l-6 6" />
    </svg>
  );
}

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

// Sidebar expand icon (panel with arrow pointing left - to show panel)
export function SidebarExpandIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {/* Panel outline */}
      <rect x="3" y="3" width="18" height="18" rx="2" />
      {/* Divider line */}
      <line x1="15" y1="3" x2="15" y2="21" />
      {/* Arrow pointing left (expand) */}
      <polyline points="11 9 7 12 11 15" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Sidebar collapse icon (panel with arrow pointing right - to hide panel)
export function SidebarCollapseIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {/* Panel outline */}
      <rect x="3" y="3" width="18" height="18" rx="2" />
      {/* Divider line */}
      <line x1="15" y1="3" x2="15" y2="21" />
      {/* Arrow pointing right (collapse) */}
      <polyline points="7 9 11 12 7 15" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Settings icon (gear)
export function SettingsIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
