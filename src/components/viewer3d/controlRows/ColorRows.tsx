import {
  memo,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type WheelEvent,
} from 'react';
import { colorPickerStyles, controlPanelStyles, inputStyles } from '../../../theme';
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
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const restoreEditFocus = useRef(false);

  const startEditing = () => {
    setInputValue(value);
    setIsEditing(true);
  };

  useEffect(() => {
    if (!isEditing && restoreEditFocus.current) {
      restoreEditFocus.current = false;
      editButtonRef.current?.focus();
    }
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
      e.preventDefault();
      e.stopPropagation();
      restoreEditFocus.current = true;
      applyValue();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      restoreEditFocus.current = true;
      setIsEditing(false);
    }
  };

  return (
    <div className={styles.row}>
      <label className={styles.label}>{label}</label>
      <div className="flex items-center gap-2 flex-1">
        {/* Color picker swatch */}
        <label
          className={colorPickerStyles.swatch}
          style={getBackgroundColorStyle(value)}
        >
          <input
            type="color"
            aria-label={typeof label === 'string' ? label : 'Color'}
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
            aria-label={typeof label === 'string' ? label : 'Color value'}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={applyValue}
            onKeyDown={handleKeyDown}
            className={`${inputStyles.numeric} w-16`}
            maxLength={HEX_COLOR_MAX_LENGTH}
          />
        ) : (
          <button
          ref={editButtonRef}
            type="button"
            aria-label="Edit hex color"
            className={`${colorPickerStyles.readout} value-edit-button`}
            onClick={startEditing}
            title="Click to edit"
          >
            {formatHexColorDisplay(value)}
          </button>
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
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const restoreEditFocus = useRef(false);

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

  const startEditing = () => {
    setInputValue(String(hue));
    setIsEditing(true);
  };

  useEffect(() => {
    if (!isEditing && restoreEditFocus.current) {
      restoreEditFocus.current = false;
      editButtonRef.current?.focus();
    }
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
      e.preventDefault();
      e.stopPropagation();
      restoreEditFocus.current = true;
      applyValue();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      restoreEditFocus.current = true;
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
          aria-label={label}
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
            aria-label={typeof label === 'string' ? label : 'Color value'}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={applyValue}
          onKeyDown={handleKeyDown}
          className={styles.valueInput}
          style={getColorStyle(value)}
        />
      ) : (
        <button
          ref={editButtonRef}
          type="button"
          aria-label={`Edit ${label}`}
          className={`${styles.value} value-edit-button`}
          style={getColorStyle(value)}
          onClick={startEditing}
          title="Click to edit"
        >
          {getHueDisplayLabel(hue)}
        </button>
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
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const restoreEditFocus = useRef(false);

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    onChange(getHueWheelValue(value, e.deltaY));
  };

  const startEditing = () => {
    setInputValue(String(value));
    setIsEditing(true);
  };

  useEffect(() => {
    if (!isEditing && restoreEditFocus.current) {
      restoreEditFocus.current = false;
      editButtonRef.current?.focus();
    }
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
      e.preventDefault();
      e.stopPropagation();
      restoreEditFocus.current = true;
      applyValue();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      restoreEditFocus.current = true;
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
          aria-label={label}
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
            aria-label={typeof label === 'string' ? label : 'Color value'}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={applyValue}
          onKeyDown={handleKeyDown}
          className={styles.valueInput}
          style={getColorStyle(displayColor)}
        />
      ) : (
        <button
          ref={editButtonRef}
          type="button"
          aria-label={`Edit ${label}`}
          className={`${styles.value} value-edit-button`}
          style={getColorStyle(displayColor)}
          onClick={startEditing}
          title="Click to edit"
        >
          {getHueDisplayLabel(value)}
        </button>
      )}
    </div>
  );
});
