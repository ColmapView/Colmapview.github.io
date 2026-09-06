import { memo, useId, type WheelEvent } from 'react';
import { controlPanelStyles } from '../../../theme';
import { ToggleSwitch } from '../../ui/ToggleSwitch';
import {
  getNextSelectRowValue,
  getSelectRowOptionValue,
  getToggledRowValue,
  type SelectRowOption,
} from './basicRowsPolicy';

const styles = controlPanelStyles;

export interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const ToggleRow = memo(function ToggleRow({ label, checked, onChange }: ToggleRowProps) {
  return (
    <label className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className="flex-1" />
      <ToggleSwitch ariaLabel={label} checked={checked} onChange={() => onChange(getToggledRowValue(checked))} size="sm" />
    </label>
  );
});

export interface SelectRowProps<T extends string = string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly SelectRowOption<T>[];
}

export function SelectRow<T extends string>({ label, value, onChange, options }: SelectRowProps<T>) {
  const id = useId();
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const nextValue = getNextSelectRowValue(options, value, e.deltaY);
    if (nextValue !== null) {
      onChange(nextValue);
    }
  };

  return (
    <div className={styles.row} onWheel={handleWheel}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const nextValue = getSelectRowOptionValue(options, e.target.value);
          if (nextValue !== null) {
            onChange(nextValue);
          }
        }}
        className={styles.selectRight}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
