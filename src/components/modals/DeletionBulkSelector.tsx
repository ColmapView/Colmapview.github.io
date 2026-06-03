import { memo } from 'react';
import { PlusCircleIcon } from '../../icons';
import { inputStyles } from '../../theme';
import {
  getDeletionBulkAddButtonState,
  type DeletionBulkSelectOption,
} from './deletionModalViewModel';

export interface DeletionBulkSelectorProps {
  label: string;
  value: string;
  options: readonly DeletionBulkSelectOption[];
  placeholder: string;
  addTitle: string;
  onChange: (value: string) => void;
  onAdd: () => void;
}

export const DeletionBulkSelector = memo(function DeletionBulkSelector({
  label,
  value,
  options,
  placeholder,
  addTitle,
  onChange,
  onAdd,
}: DeletionBulkSelectorProps) {
  if (options.length === 0) return null;

  const addButton = getDeletionBulkAddButtonState(value);
  const labelText = label.endsWith(':') ? label.slice(0, -1) : label;

  return (
    <div className="flex items-center gap-2">
      <div className="text-ds-secondary text-xs w-24 flex-shrink-0">{label}</div>
      <div className="flex gap-1 items-center flex-1 min-w-0">
        <select
          aria-label={labelText}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          className={`${inputStyles.select} ${inputStyles.selectSizes.xs} flex-1`}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          aria-label={addTitle}
          onClick={onAdd}
          disabled={addButton.disabled}
          className={addButton.className}
          title={addTitle}
        >
          <PlusCircleIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});
