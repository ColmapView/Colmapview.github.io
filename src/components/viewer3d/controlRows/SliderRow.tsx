import {
  memo,
  useEffect,
  useRef,
  useId,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type WheelEvent,
} from 'react';
import { controlPanelStyles } from '../../../theme';
import {
  formatSliderValue,
  getCommittedSliderInputValue,
  getSafeSliderValue,
  getSliderProgress,
  getSliderRangeProgressStyle,
  getSliderWheelValue,
  parseSliderRangeValue,
} from './sliderRowPolicy';

const styles = controlPanelStyles;

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

export const SliderRow = memo(function SliderRow({ label, value, min, max, step, onChange, formatValue, inputMax }: SliderRowProps) {
  const controlId = useId();
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Defensive: ensure value is a valid number (handles null/undefined from corrupted localStorage)
  const safeValue = getSafeSliderValue(value, min);
  const displayValue = formatSliderValue(safeValue, step, formatValue);
  const progress = getSliderProgress(safeValue, min, max);

  const handleDoubleClick = () => {
    setInputValue(String(safeValue));
    setIsEditing(true);
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    } else if (!isEditing && restoreFocus.current) {
      restoreFocus.current = false;
      editButtonRef.current?.focus();
    }
  }, [isEditing]);

  const applyValue = () => {
    const committedValue = getCommittedSliderInputValue(inputValue, min, max, inputMax);
    if (committedValue !== null) {
      onChange(committedValue);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      restoreFocus.current = true;
      applyValue();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      restoreFocus.current = true;
      setIsEditing(false);
    }
  };

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    onChange(getSliderWheelValue({
      value: safeValue,
      min,
      max,
      step,
      deltaY: e.deltaY,
    }));
  };

  return (
    <div className={styles.row} onWheel={handleWheel}>
      <label id={`${controlId}-label`} htmlFor={controlId} className={styles.label}>{label}</label>
      <input
        id={controlId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={safeValue}
        onChange={(e) => {
          const nextValue = parseSliderRangeValue(e.target.value);
          if (nextValue !== null) {
            onChange(nextValue);
          }
        }}
        className={styles.slider}
        style={getSliderRangeProgressStyle(progress)}
      />
      {isEditing ? (
        <input
          ref={inputRef}
          aria-labelledby={`${controlId}-label`}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={applyValue}
          onKeyDown={handleKeyDown}
          className={styles.valueInput}
        />
      ) : (
        <button
          ref={editButtonRef}
          type="button"
          aria-label={`Edit ${typeof label === "string" ? label : "value"}`}
          className={`${styles.value} bg-transparent p-0 border-none rounded`}
          onClick={handleDoubleClick}
          onDoubleClick={handleDoubleClick}
          title="Click to edit"
        >
          {displayValue}
        </button>
      )}
    </div>
  );
});
