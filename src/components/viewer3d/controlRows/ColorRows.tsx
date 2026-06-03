import {
  memo,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type WheelEvent,
} from 'react';
import { colorPickerStyles, controlPanelStyles } from '../../../theme';
import { hexToHsl } from '../../../utils/colorUtils';
import {
  HEX_COLOR_MAX_LENGTH,
  formatHexColorDisplay,
  getBackgroundColorStyle,
  getBackgroundStyle,
  getColorStyle,
  getHueDisplayColor,
  getHueDisplayLabel,
  getHueWheelValue,
  normalizeHexColorInput,
  parseHueInput,
  parseHueRangeValue,
} from './colorRowsPolicy';

const styles = controlPanelStyles;

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
    const hex = normalizeHexColorInput(inputValue);
    if (hex !== null) {
      onChange(hex);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
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
          style={getBackgroundColorStyle(value)}
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
            maxLength={HEX_COLOR_MAX_LENGTH}
          />
        ) : (
          <span
            className="text-ds-secondary text-sm font-mono cursor-pointer hover:text-ds-primary transition-colors"
            onDoubleClick={handleDoubleClick}
            title="Double-click to edit"
          >
            {formatHexColorDisplay(value)}
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
    onChange(getHueDisplayColor(newHue));
  };

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    handleHueChange(getHueWheelValue(hue, e.deltaY));
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
    const hueValue = parseHueInput(inputValue);
    if (hueValue !== null) {
      handleHueChange(hueValue);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
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
          style={getBackgroundStyle(colorPickerStyles.hueGradient)}
        />
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={hue}
          onChange={(e) => {
            const nextHue = parseHueRangeValue(e.target.value);
            if (nextHue !== null) {
              handleHueChange(nextHue);
            }
          }}
          className={colorPickerStyles.hueSlider}
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
          style={getColorStyle(value)}
        />
      ) : (
        <span
          className={styles.value}
          style={getColorStyle(value)}
          onDoubleClick={handleDoubleClick}
          title="Double-click to edit"
        >
          {getHueDisplayLabel(hue)}
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

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    onChange(getHueWheelValue(value, e.deltaY));
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
    const hueValue = parseHueInput(inputValue);
    if (hueValue !== null) {
      onChange(hueValue);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      applyValue();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  // Get color at current hue position for text display
  const displayColor = getHueDisplayColor(value);

  return (
    <div className={styles.row} onWheel={handleWheel}>
      <label className={styles.label}>{label}</label>
      <div className="relative flex-1 min-w-0 h-4 flex items-center">
        <div
          className="absolute left-0 right-0 h-1.5 rounded-full z-0"
          style={getBackgroundStyle(colorPickerStyles.hueGradient)}
        />
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={value}
          onChange={(e) => {
            const nextHue = parseHueRangeValue(e.target.value);
            if (nextHue !== null) {
              onChange(nextHue);
            }
          }}
          className={colorPickerStyles.hueSlider}
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
          style={getColorStyle(displayColor)}
        />
      ) : (
        <span
          className={styles.value}
          style={getColorStyle(displayColor)}
          onDoubleClick={handleDoubleClick}
          title="Double-click to edit"
        >
          {getHueDisplayLabel(value)}
        </span>
      )}
    </div>
  );
});
