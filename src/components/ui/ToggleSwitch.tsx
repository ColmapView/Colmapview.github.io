import { memo } from 'react';
import { getToggleSwitchClasses, toggleSwitchStyles } from '../../theme';

interface ToggleSwitchProps {
  /** Whether the toggle is on */
  checked: boolean;
  /** Called when the toggle state changes */
  onChange: (checked: boolean) => void;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Whether the toggle is disabled */
  disabled?: boolean;
  /** Optional label text */
  label?: string;
  /** Label position */
  labelPosition?: 'left' | 'right';
  /** Additional class name for the container */
  className?: string;
}

/**
 * Toggle switch component (oval with circle style).
 * Single source of truth for toggle switches in the app.
 * Replaces checkbox inputs for boolean toggles.
 */
export const ToggleSwitch = memo(function ToggleSwitch({
  checked,
  onChange,
  size = 'sm',
  disabled = false,
  label,
  labelPosition = 'left',
  className = '',
}: ToggleSwitchProps) {
  const classes = getToggleSwitchClasses(checked, size, disabled);

  const handleClick = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!disabled) {
        onChange(!checked);
      }
    }
  };

  const toggle = (
    <div
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      className={classes.track}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <span className={classes.thumb} style={classes.thumbStyle} />
    </div>
  );

  if (label) {
    return (
      <label className={`${toggleSwitchStyles.container} ${className}`}>
        {labelPosition === 'left' && (
          <span className={toggleSwitchStyles.label}>{label}</span>
        )}
        {toggle}
        {labelPosition === 'right' && (
          <span className={toggleSwitchStyles.label}>{label}</span>
        )}
      </label>
    );
  }

  return toggle;
});
