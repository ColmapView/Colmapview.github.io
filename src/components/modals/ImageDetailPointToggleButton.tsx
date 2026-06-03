import { getImageDetailPointToggleButtonState } from './imageDetailControlsViewModel';

interface ImageDetailPointToggleButtonProps {
  variant: 'touch' | 'desktop';
  label: string;
  count: number;
  inactiveCountClass: string;
  active: boolean;
  isMarkedForDeletion: boolean;
  onToggle: (show: boolean) => void;
}

export function ImageDetailPointToggleButton({
  variant,
  label,
  count,
  inactiveCountClass,
  active,
  isMarkedForDeletion,
  onToggle,
}: ImageDetailPointToggleButtonProps) {
  const buttonState = getImageDetailPointToggleButtonState({
    variant,
    isActive: active,
    isMarkedForDeletion,
    inactiveCountClass,
  });

  const handleToggle = () => {
    if (!buttonState.disabled) {
      onToggle(buttonState.nextActive);
    }
  };
  const buttonStyle = buttonState.minHeight === undefined
    ? undefined
    : { minHeight: buttonState.minHeight };

  return (
    <button
      onClick={handleToggle}
      disabled={buttonState.disabled}
      className={buttonState.className}
      style={buttonStyle}
    >
      {label} <span className={buttonState.countClass}>({count})</span>
    </button>
  );
}
