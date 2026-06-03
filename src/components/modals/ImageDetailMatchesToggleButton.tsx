import {
  getImageDetailMatchesToggleButtonState,
  type ImageDetailControlVariant,
} from './imageDetailControlsViewModel';

interface ImageDetailMatchesToggleButtonProps {
  variant: ImageDetailControlVariant;
  active: boolean;
  isMarkedForDeletion: boolean;
  onToggle: (show: boolean) => void;
}

export function ImageDetailMatchesToggleButton({
  variant,
  active,
  isMarkedForDeletion,
  onToggle,
}: ImageDetailMatchesToggleButtonProps) {
  const buttonState = getImageDetailMatchesToggleButtonState({
    variant,
    isActive: active,
    isMarkedForDeletion,
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
      {buttonState.label}
    </button>
  );
}
