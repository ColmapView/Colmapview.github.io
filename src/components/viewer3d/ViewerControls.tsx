import { useState, useEffect, memo, useCallback, useRef, type ReactNode } from 'react';
import { useReconstructionStore, usePointCloudStore, useCameraStore, useUIStore, useExportStore, useTransformStore, usePointPickingStore } from '../../store';
import { computeNormalAlignment, sim3dToEuler, composeSim3d, createSim3dFromEuler } from '../../utils/sim3dTransforms';
import type { ColorMode } from '../../types/colmap';
import type { CameraMode, ImageLoadMode, CameraDisplayMode, FrustumColorMode, MatchesDisplayMode, SelectionColorMode, AxesDisplayMode, AxesCoordinateSystem, AxisLabelMode, ScreenshotSize, ScreenshotFormat, GizmoMode } from '../../store/types';
import { useHotkeys } from 'react-hotkeys-hook';
import { getTooltipProps, controlPanelStyles, getControlButtonClass, HOTKEYS } from '../../theme';
import { exportReconstructionText, exportReconstructionBinary, exportPointsPLY } from '../../parsers';
import { isIdentityEuler } from '../../utils/sim3dTransforms';
import { useFileDropzone } from '../../hooks/useFileDropzone';
import { extractConfigurationFromStores, serializeConfigToYaml } from '../../config/configuration';

// HSL to Hex conversion
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Hex to HSL conversion
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// Icon wrapper that shows text abbreviation on hover (uses CSS group-hover from parent button)
function HoverIcon({ icon, label }: { icon: ReactNode; label: string }) {
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
function ScreenshotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

// Export/download icon
function ExportIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

// Transform icon - bounding box with corner handles
function TransformIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      {/* Bounding box */}
      <rect x="5" y="5" width="14" height="14" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.5" />
      {/* Corner handles */}
      <rect x="3" y="3" width="4" height="4" fill="currentColor" stroke="none" rx="0.5" />
      <rect x="17" y="3" width="4" height="4" fill="currentColor" stroke="none" rx="0.5" />
      <rect x="3" y="17" width="4" height="4" fill="currentColor" stroke="none" rx="0.5" />
      <rect x="17" y="17" width="4" height="4" fill="currentColor" stroke="none" rx="0.5" />
      {/* Center crosshair */}
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <line x1="9" y1="12" x2="15" y2="12" strokeWidth="1.5" />
      <line x1="12" y1="9" x2="12" y2="15" strokeWidth="1.5" />
    </svg>
  );
}

// Camera frustum icon (video camera)
function FrustumIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="6" width="13" height="12" rx="2" />
      <path d="M15 10l7-4v12l-7-4z" />
    </svg>
  );
}

// Arrow icon for camera direction indicator
function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M19 12l-6-6M19 12l-6 6" />
    </svg>
  );
}

// Camera off icon
function CameraOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="6" width="13" height="12" rx="2" />
      <path d="M15 10l7-4v12l-7-4z" />
      <path d="M3 21L21 3" strokeWidth="2.5" />
    </svg>
  );
}

function ImageIcon({ className }: { className?: string }) {
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
function MatchOffIcon({ className }: { className?: string }) {
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
function MatchOnIcon({ className }: { className?: string }) {
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
function MatchBlinkIcon({ className }: { className?: string }) {
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

function RainbowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeLinecap="round">
      {/* Top-left camera (1/3) */}
      <rect x="1" y="1" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 2.5l3-1.5v6l-3-1.5z" stroke="currentColor" strokeWidth="1.5" />
      {/* Rainbow (2/3) - middle and bottom right, 3 MYC curves */}
      <path d="M8 17a7 7 0 0 1 14 0" stroke="#FF00FF" strokeWidth="2.5" />
      <path d="M10 17a5 5 0 0 1 10 0" stroke="#FFFF00" strokeWidth="2.5" />
      <path d="M12 17a3 3 0 0 1 6 0" stroke="#00FFFF" strokeWidth="2.5" />
    </svg>
  );
}

// Selection color off icon (small camera top-left, empty circle bottom-right)
function SelectionOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {/* Top-left camera (1/3) */}
      <rect x="1" y="1" width="7" height="5" rx="1" strokeWidth="1.5" />
      <path d="M8 2.5l3-1.5v6l-3-1.5z" strokeWidth="1.5" />
      {/* Empty circle middle/bottom-right (2/3) */}
      <circle cx="15" cy="15" r="6" fill="none" />
    </svg>
  );
}

// Selection static icon (small camera top-left, solid magenta dot bottom-right)
function SelectionStaticIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeWidth="1.5">
      {/* Top-left camera (1/3) */}
      <rect x="1" y="1" width="7" height="5" rx="1" stroke="currentColor" />
      <path d="M8 2.5l3-1.5v6l-3-1.5z" stroke="currentColor" />
      {/* Solid magenta dot middle/bottom-right (2/3) */}
      <circle cx="15" cy="15" r="6" fill="#FF00FF" />
    </svg>
  );
}

// Selection blink icon (small camera top-left, pulsing rings bottom-right)
function SelectionBlinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeWidth="1.5">
      {/* Top-left camera (1/3) */}
      <rect x="1" y="1" width="7" height="5" rx="1" stroke="currentColor" />
      <path d="M8 2.5l3-1.5v6l-3-1.5z" stroke="currentColor" />
      {/* Pulsing rings middle/bottom-right (2/3) */}
      <circle cx="15" cy="15" r="2.5" fill="#FF00FF" />
      <circle cx="15" cy="15" r="4.5" stroke="#FF00FF" strokeWidth="1.5" opacity="0.6" fill="none" />
      <circle cx="15" cy="15" r="7" stroke="#FF00FF" strokeWidth="1" opacity="0.3" fill="none" />
    </svg>
  );
}

function AxesIcon({ className }: { className?: string }) {
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

function AxesOffIcon({ className }: { className?: string }) {
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

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 8h18M3 16h18M8 3v18M16 3v18" />
    </svg>
  );
}

// Combined Axes + Grid icon for "both" mode
function AxesGridIcon({ className }: { className?: string }) {
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
function ColorRgbIcon({ className }: { className?: string }) {
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

function ColorErrorIcon({ className }: { className?: string }) {
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

function ColorTrackIcon({ className }: { className?: string }) {
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

function BgIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18" />
      <path d="M12 3a9 9 0 0 0 0 18" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

// View icon - 3D cube suggesting viewing angles
function ViewIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

// Image loading icons - 2 stacked rectangles top-left, modifier bottom-right
function PrefetchIcon({ className }: { className?: string }) {
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

function LazyIcon({ className }: { className?: string }) {
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

function SkipIcon({ className }: { className?: string }) {
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

function OrbitIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
      <circle cx="21" cy="12" r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FlyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2.5 12 Q12 2 21.5 12 Q12 22 2.5 12" />
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    </svg>
  );
}

type PanelType = 'view' | 'points' | 'scale' | 'matches' | 'selectionColor' | 'axes' | 'bg' | 'camera' | 'prefetch' | 'frustumColor' | 'screenshot' | 'export' | 'transform' | null;

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
}

const SliderRow = memo(function SliderRow({ label, value, min, max, step, onChange, formatValue }: SliderRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Defensive: ensure value is a valid number (handles null/undefined from corrupted localStorage)
  const safeValue = value ?? min;
  const displayValue = formatValue ? formatValue(safeValue) : String(safeValue);
  const progress = ((safeValue - min) / (max - min)) * 100;

  const handleDoubleClick = () => {
    setInputValue(String(safeValue));
    setIsEditing(true);
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const applyValue = () => {
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed)) {
      const clamped = Math.min(max, Math.max(min, parsed));
      onChange(clamped);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      applyValue();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -step : step;
    const newValue = Math.min(max, Math.max(min, safeValue + delta));
    onChange(newValue);
  };

  return (
    <div className={styles.row} onWheel={handleWheel}>
      <label className={styles.label}>{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={safeValue}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={styles.slider}
        style={{ '--range-progress': `${progress}%` } as React.CSSProperties}
      />
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={applyValue}
          onKeyDown={handleKeyDown}
          className={styles.valueInput}
        />
      ) : (
        <span
          className={styles.value}
          onDoubleClick={handleDoubleClick}
          title="Double-click to edit"
        >
          {displayValue}
        </span>
      )}
    </div>
  );
});

interface HueRowProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const HueRow = memo(function HueRow({ label, value, onChange }: HueRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const hsl = hexToHsl(value);
  const hue = hsl.h;

  const handleHueChange = (newHue: number) => {
    // Use full saturation and 50% lightness for vibrant colors
    onChange(hslToHex(newHue, 100, 50));
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -5 : 5;
    const newHue = (hue + delta + 360) % 360;
    handleHueChange(newHue);
  };

  const handleDoubleClick = () => {
    setInputValue(String(hue));
    setIsEditing(true);
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const applyValue = () => {
    const parsed = parseInt(inputValue);
    if (!isNaN(parsed)) {
      const clamped = ((parsed % 360) + 360) % 360;
      handleHueChange(clamped);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      applyValue();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  return (
    <div className={styles.row} onWheel={handleWheel}>
      <label className={styles.label}>{label}</label>
      <div className="relative flex-1 min-w-0 h-4 flex items-center">
        <div
          className="absolute left-0 right-0 h-1.5 rounded-full z-0"
          style={{
            background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
          }}
        />
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={hue}
          onChange={(e) => handleHueChange(parseInt(e.target.value))}
          className="w-full h-4 cursor-pointer appearance-none bg-transparent relative z-10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-gray-400 [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-gray-400 [&::-moz-range-thumb]:cursor-pointer [&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:bg-transparent"
        />
      </div>
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={applyValue}
          onKeyDown={handleKeyDown}
          className={styles.valueInput}
          style={{ color: value }}
        />
      ) : (
        <span
          className={styles.value}
          style={{ color: value }}
          onDoubleClick={handleDoubleClick}
          title="Double-click to edit"
        >
          {hue}°
        </span>
      )}
    </div>
  );
});

interface SelectRowProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

const SelectRow = memo(function SelectRow({ label, value, onChange, options }: SelectRowProps) {
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const currentIndex = options.findIndex(opt => opt.value === value);
    if (e.deltaY > 0) {
      const nextIndex = Math.min(currentIndex + 1, options.length - 1);
      onChange(options[nextIndex].value);
    } else {
      const prevIndex = Math.max(currentIndex - 1, 0);
      onChange(options[prevIndex].value);
    }
  };

  return (
    <div className={styles.row} onWheel={handleWheel}>
      <label className={styles.label}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={styles.select}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <span className={styles.value} />
    </div>
  );
});

interface PanelWrapperProps {
  title: string;
  children: React.ReactNode;
}

const PanelWrapper = memo(function PanelWrapper({ title, children }: PanelWrapperProps) {
  return (
    <div className={styles.panelWrapper}>
      <div className={styles.panel}>
        <div className={styles.panelTitle}>{title}</div>
        {children}
      </div>
    </div>
  );
});

// Use centralized styles from theme
const styles = controlPanelStyles;

interface ControlButtonProps {
  panelId: PanelType;
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
  icon: React.ReactNode;
  tooltip: string;
  isActive?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  panelTitle?: string;
  children?: React.ReactNode;
  disabled?: boolean;
}

const ControlButton = memo(function ControlButton({
  panelId,
  activePanel,
  setActivePanel,
  icon,
  tooltip,
  isActive = false,
  onClick,
  onDoubleClick,
  panelTitle,
  children,
  disabled = false,
}: ControlButtonProps) {
  const isHovered = activePanel === panelId;
  const hasPanel = panelTitle && children;

  return (
    <div
      className="relative w-10 control-button-responsive"
      onMouseEnter={() => !disabled && setActivePanel(panelId)}
      onMouseLeave={() => setActivePanel(null)}
    >
      <button
        onClick={disabled ? undefined : onClick}
        onDoubleClick={disabled ? undefined : onDoubleClick}
        disabled={disabled}
        className={`group ${getControlButtonClass(isActive, isHovered)} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
        {...(!hasPanel && getTooltipProps(disabled ? `${tooltip} (no data loaded)` : tooltip, 'left'))}
      >
        {icon}
      </button>
      {hasPanel && isHovered && !disabled && (
        <PanelWrapper title={panelTitle}>
          {children}
        </PanelWrapper>
      )}
    </div>
  );
});

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
  const selectedPoints = usePointPickingStore((s) => s.selectedPoints);
  const resetPicking = usePointPickingStore((s) => s.reset);

  const hasChanges = !isIdentityEuler(transform);

  // Auto-apply normal alignment when 3 points are selected
  useEffect(() => {
    if (pickingMode === 'normal-3pt' && selectedPoints.length === 3) {
      const alignTransform = computeNormalAlignment(
        selectedPoints[0].position,
        selectedPoints[1].position,
        selectedPoints[2].position
      );
      const currentSim3d = createSim3dFromEuler(transform);
      const composed = composeSim3d(alignTransform, currentSim3d);
      const composedEuler = sim3dToEuler(composed);
      setTransform(composedEuler);
      resetPicking();
    }
  }, [pickingMode, selectedPoints, transform, setTransform, resetPicking]);

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

  const gizmoModeLabel = gizmoMode === 'off' ? 'Off' :
                         gizmoMode === 'local' ? 'Local' : 'Global';
  const gizmoTooltip = `Gizmo: ${gizmoModeLabel}${hasChanges ? ' (dbl-click to apply)' : ''}`;

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
          label="3D Gizmo"
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
          <button
            onClick={() => applyPreset('normalizeScale')}
            className={styles.presetButton}
            data-tooltip="Center + scale to ~10 units"
            data-tooltip-pos="bottom"
          >
            Normalize Scale
          </button>
        </div>

        {/* Point picking tools */}
        <div className={styles.presetGroup}>
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
  const imagePlaneOpacity = useCameraStore((s) => s.imagePlaneOpacity);
  const setImagePlaneOpacity = useCameraStore((s) => s.setImagePlaneOpacity);
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
    const newHsl = hexToHsl(backgroundColor);
    // Only update if the color actually changed (not just from our own updates)
    if (hslToHex(hsl.h, hsl.s, hsl.l) !== backgroundColor) {
      setHsl(newHsl);
    }
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

  // Cycle through image load modes: lazy → prefetch → skip → lazy
  const cycleImageLoadMode = useCallback(() => {
    const modes: ImageLoadMode[] = ['lazy', 'prefetch', 'skip'];
    const currentIndex = modes.indexOf(imageLoadMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setImageLoadMode(modes[nextIndex]);
  }, [imageLoadMode, setImageLoadMode]);

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
          {(axesDisplayMode === 'axes' || axesDisplayMode === 'both') && (
            <>
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
            </>
          )}
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
          <SliderRow
            label="Hue"
            value={hsl.h}
            min={0}
            max={360}
            step={1}
            onChange={handleHueChange}
            formatValue={(v) => `${Math.round(v)}°`}
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
                label="Unselected"
                value={unselectedCameraOpacity}
                min={0}
                max={1}
                step={0.05}
                onChange={setUnselectedCameraOpacity}
                formatValue={(v) => v.toFixed(2)}
              />
            </>
          )}
          {cameraDisplayMode === 'imageplane' && (
            <SliderRow label="Opacity" value={imagePlaneOpacity} min={0} max={1} step={0.05} onChange={setImagePlaneOpacity} formatValue={(v) => v.toFixed(2)} />
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
        </div>
      </ControlButton>

      <ControlButton
        panelId="prefetch"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={
          <HoverIcon
            icon={
              imageLoadMode === 'prefetch' ? <PrefetchIcon className="w-6 h-6" /> :
              imageLoadMode === 'lazy' ? <LazyIcon className="w-6 h-6" /> :
              <SkipIcon className="w-6 h-6" />
            }
            label={imageLoadMode === 'prefetch' ? 'PRE' : imageLoadMode === 'lazy' ? 'LZY' : 'OFF'}
          />
        }
        tooltip={
          imageLoadMode === 'prefetch' ? 'Prefetch mode' :
          imageLoadMode === 'lazy' ? 'Lazy loading' :
          'Skip images'
        }
        onClick={cycleImageLoadMode}
        panelTitle="Image Loading"
      >
        <div className={styles.panelContent}>
          <SelectRow
            label="Mode"
            value={imageLoadMode}
            onChange={(v) => setImageLoadMode(v as ImageLoadMode)}
            options={[
              { value: 'prefetch', label: 'Prefetch' },
              { value: 'lazy', label: 'Lazy' },
              { value: 'skip', label: 'Skip' },
            ]}
          />
          <div className="text-ds-secondary text-sm mt-3">
            {imageLoadMode === 'prefetch' ? (
              <>
                <div className="mb-1 font-medium">Prefetch:</div>
                <div>Loads all images upfront.</div>
                <div>Slower initial load, but</div>
                <div>smoother interaction after.</div>
              </>
            ) : imageLoadMode === 'lazy' ? (
              <>
                <div className="mb-1 font-medium">Lazy Loading:</div>
                <div>Loads images on demand.</div>
                <div>Faster startup, may have</div>
                <div>brief delays when viewing.</div>
              </>
            ) : (
              <>
                <div className="mb-1 font-medium">Skip Images:</div>
                <div>No images loaded.</div>
                <div>Fastest startup for</div>
                <div>point cloud only viewing.</div>
              </>
            )}
          </div>
        </div>
      </ControlButton>
    </div>
  );
}
