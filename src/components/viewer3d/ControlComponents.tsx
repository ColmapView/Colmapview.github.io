/**
 * Reusable UI components for the 3D viewer controls.
 * Extracted from ViewerControls.tsx for better organization.
 */

import type { ReactNode } from 'react';
import { useState, useEffect, useLayoutEffect, memo, useRef } from 'react';
import { controlPanelStyles, getControlButtonClass, getTooltipProps } from '../../theme';
import { hslToHex, hexToHsl } from '../../utils/colorUtils';
import { ToggleSwitch } from '../ui/ToggleSwitch';

// Use centralized styles from theme
const styles = controlPanelStyles;

// Panel type for control buttons
export type PanelType = 'view' | 'points' | 'scale' | 'matches' | 'selectionColor' | 'axes' | 'bg' | 'camera' | 'prefetch' | 'frustumColor' | 'screenshot' | 'share' | 'export' | 'transform' | 'gallery' | 'rig' | 'settings' | 'floor' | null;

export interface SliderRowProps {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
  /** Maximum value allowed when typing directly (defaults to max) */
  inputMax?: number;
}

// Mouse scroll wheel icon for keyboard shortcut hints
export const MouseScrollIcon = ({ className = "w-3 h-3" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    {/* Mouse body */}
    <rect x="6" y="2" width="12" height="20" rx="6" />
    {/* Scroll wheel */}
    <line x1="12" y1="6" x2="12" y2="10" />
  </svg>
);

// Calculate decimal places from step value (e.g., 0.1 -> 1, 0.05 -> 2, 1 -> 0)
function getDecimalPlaces(step: number): number {
  if (step >= 1) return 0;
  const str = step.toString();
  const decimalIndex = str.indexOf('.');
  return decimalIndex === -1 ? 0 : str.length - decimalIndex - 1;
}

// Round value to the precision implied by the step
function roundToStep(value: number, step: number): number {
  const decimals = getDecimalPlaces(step);
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export const SliderRow = memo(function SliderRow({ label, value, min, max, step, onChange, formatValue, inputMax }: SliderRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Defensive: ensure value is a valid number (handles null/undefined from corrupted localStorage)
  const safeValue = value ?? min;
  // Default format: show appropriate decimal places based on step
  const decimals = getDecimalPlaces(step);
  const displayValue = formatValue ? formatValue(safeValue) : safeValue.toFixed(decimals);
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
      // Use inputMax for text input (allows values beyond slider range)
      const effectiveMax = inputMax ?? max;
      const clamped = Math.min(effectiveMax, Math.max(min, parsed));
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
    // Round to step precision to avoid floating point errors like 2.1000000001
    const newValue = roundToStep(Math.min(max, Math.max(min, safeValue + delta)), step);
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

export interface ColorPickerRowProps {
  label: ReactNode;
  value: string; // hex color
  onChange: (hex: string) => void;
}

export const ColorPickerRow = memo(function ColorPickerRow({ label, value, onChange }: ColorPickerRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDoubleClick = () => {
    setInputValue(value);
    setIsEditing(true);
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const applyValue = () => {
    // Validate hex color
    const hex = inputValue.startsWith('#') ? inputValue : `#${inputValue}`;
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      onChange(hex.toLowerCase());
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
    <div className={styles.row}>
      <label className={styles.label}>{label}</label>
      <div className="flex items-center gap-2 flex-1">
        {/* Color picker swatch */}
        <label
          className="relative w-8 h-6 rounded overflow-hidden border border-ds-border hover:border-ds-border-hover transition-colors cursor-pointer block shrink-0"
          style={{ backgroundColor: value }}
        >
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="sr-only"
          />
        </label>
        {/* Hex value display/edit */}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={applyValue}
            onKeyDown={handleKeyDown}
            className="bg-ds-bg-secondary text-ds-primary text-sm font-mono px-1 py-0.5 rounded border border-ds-border w-16"
            maxLength={7}
          />
        ) : (
          <span
            className="text-ds-secondary text-sm font-mono cursor-pointer hover:text-ds-primary transition-colors"
            onDoubleClick={handleDoubleClick}
            title="Double-click to edit"
          >
            {value.toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
});

export interface HueRowProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export const HueRow = memo(function HueRow({ label, value, onChange }: HueRowProps) {
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

// Hue slider row for direct numeric hue values (0-360) with rainbow gradient
export interface HueSliderRowProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

export const HueSliderRow = memo(function HueSliderRow({ label, value, onChange }: HueSliderRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -5 : 5;
    const newHue = (value + delta + 360) % 360;
    onChange(newHue);
  };

  const handleDoubleClick = () => {
    setInputValue(String(value));
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

  // Get color at current hue position for text display
  const displayColor = hslToHex(value, 100, 50);

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
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
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
          style={{ color: displayColor }}
        />
      ) : (
        <span
          className={styles.value}
          style={{ color: displayColor }}
          onDoubleClick={handleDoubleClick}
          title="Double-click to edit"
        >
          {value}°
        </span>
      )}
    </div>
  );
});

export interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const ToggleRow = memo(function ToggleRow({ label, checked, onChange }: ToggleRowProps) {
  return (
    <div className={styles.row}>
      <label className={styles.label}>{label}</label>
      <div className="flex-1" />
      <ToggleSwitch checked={checked} onChange={() => onChange(!checked)} size="sm" />
    </div>
  );
});

export interface SelectRowProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

export const SelectRow = memo(function SelectRow({ label, value, onChange, options }: SelectRowProps) {
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
        className={styles.selectRight}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
});

export interface PanelWrapperProps {
  title: string;
  children: React.ReactNode;
}

// Status bar height + padding to keep panel above it
const STATUS_BAR_CLEARANCE = 48; // 40px status bar + 8px padding

export const PanelWrapper = memo(function PanelWrapper({ title, children }: PanelWrapperProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [adjustedTop, setAdjustedTop] = useState<number | null>(null);
  const lastHeightRef = useRef<number>(0);

  // Adjust position to keep panel above status bar
  // Only recalculate when panel height changes significantly (>5px) to avoid jitter
  useLayoutEffect(() => {
    if (!panelRef.current) return;

    const rect = panelRef.current.getBoundingClientRect();
    const heightDiff = Math.abs(rect.height - lastHeightRef.current);

    // Skip recalculation if height hasn't changed significantly
    if (lastHeightRef.current > 0 && heightDiff < 5) {
      return;
    }
    lastHeightRef.current = rect.height;

    const viewportHeight = window.innerHeight;
    const maxBottom = viewportHeight - STATUS_BAR_CLEARANCE;

    // Check if panel extends past the status bar
    if (rect.bottom > maxBottom) {
      // Shift up by the overflow amount
      const overflow = rect.bottom - maxBottom;
      setAdjustedTop(-overflow);
    } else {
      setAdjustedTop(null);
    }
  }, [children]); // Re-check when content changes

  return (
    <div
      ref={panelRef}
      className={styles.panelWrapper}
      style={adjustedTop !== null ? { top: adjustedTop } : undefined}
    >
      <div className={styles.panel}>
        <div className={styles.panelTitle}>{title}</div>
        {children}
      </div>
    </div>
  );
});

export interface ControlButtonProps {
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

export const ControlButton = memo(function ControlButton({
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

