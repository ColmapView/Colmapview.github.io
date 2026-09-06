import { useId, type KeyboardEvent, type RefObject, type WheelEvent } from 'react';
import {
  getImageDetailMatchOpacityControlState,
  parseMatchLineOpacityValue,
} from './imageDetailControlsViewModel';

interface SharedMatchOpacityControlProps {
  matchLineOpacity: number;
  setMatchLineOpacity: (opacity: number) => void;
}

interface TouchMatchOpacityControlProps extends SharedMatchOpacityControlProps {
  variant: 'touch';
}

interface DesktopMatchOpacityControlProps extends SharedMatchOpacityControlProps {
  variant: 'desktop';
  isEditingOpacity: boolean;
  opacityInputRef: RefObject<HTMLInputElement | null>;
  opacityInputValue: string;
  setOpacityInputValue: (value: string) => void;
  onOpacityWheel: (event: WheelEvent<HTMLDivElement>) => void;
  onOpacityDoubleClick: () => void;
  onOpacityBlur: () => void;
  onOpacityKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

type ImageDetailMatchOpacityControlProps =
  | TouchMatchOpacityControlProps
  | DesktopMatchOpacityControlProps;

export function ImageDetailMatchOpacityControl(props: ImageDetailMatchOpacityControlProps) {
  if (props.variant === 'touch') {
    return <TouchMatchOpacityControl {...props} />;
  }

  return <DesktopMatchOpacityControl {...props} />;
}

function TouchMatchOpacityControl({
  matchLineOpacity,
  setMatchLineOpacity,
}: TouchMatchOpacityControlProps) {
  const controlId = useId();
  const controlState = getImageDetailMatchOpacityControlState({
    variant: 'touch',
    opacity: matchLineOpacity,
  });

  return (
    <div className={controlState.containerClassName}>
      <label htmlFor={controlId} className={controlState.labelClassName}>{controlState.label}</label>
      <input
        id={controlId}
        aria-label="Match line opacity"
        type="range"
        min={controlState.sliderMin}
        max={controlState.sliderMax}
        step={controlState.sliderStep}
        value={matchLineOpacity}
        onChange={(event) => {
          const nextOpacity = parseMatchLineOpacityValue(event.target.value);
          if (nextOpacity !== null) {
            setMatchLineOpacity(nextOpacity);
          }
        }}
        className={controlState.sliderClassName}
      />
      <span className={controlState.valueClassName}>
        {controlState.valueLabel}
      </span>
    </div>
  );
}

function DesktopMatchOpacityControl({
  matchLineOpacity,
  setMatchLineOpacity,
  isEditingOpacity,
  opacityInputRef,
  opacityInputValue,
  setOpacityInputValue,
  onOpacityWheel,
  onOpacityDoubleClick,
  onOpacityBlur,
  onOpacityKeyDown,
}: DesktopMatchOpacityControlProps) {
  const controlId = useId();
  const controlState = getImageDetailMatchOpacityControlState({
    variant: 'desktop',
    opacity: matchLineOpacity,
    isEditing: isEditingOpacity,
  });

  return (
    <div className={controlState.containerClassName} onWheel={onOpacityWheel}>
      <label htmlFor={controlId} className={controlState.labelClassName}>{controlState.label}</label>
      <input
        id={controlId}
        aria-label="Match line opacity"
        type="range"
        min={controlState.sliderMin}
        max={controlState.sliderMax}
        step={controlState.sliderStep}
        value={matchLineOpacity}
        onChange={(event) => {
          const nextOpacity = parseMatchLineOpacityValue(event.target.value);
          if (nextOpacity !== null) {
            setMatchLineOpacity(nextOpacity);
          }
        }}
        className={controlState.sliderClassName}
      />
      {controlState.showEditor ? (
        <input
          ref={opacityInputRef}
          aria-label="Match line opacity value"
          type="text"
          value={opacityInputValue}
          onChange={(event) => setOpacityInputValue(event.target.value)}
          onBlur={onOpacityBlur}
          onKeyDown={onOpacityKeyDown}
          className={controlState.editorInputClassName}
        />
      ) : controlState.showDisplayValue ? (
        <button
          type="button"
          aria-label="Edit match line opacity"
          className={`${controlState.valueClassName} bg-transparent p-0 border-none rounded`}
          onClick={onOpacityDoubleClick}
          onDoubleClick={onOpacityDoubleClick}
          title={controlState.displayValueTitle}
        >
          {controlState.valueLabel}
        </button>
      ) : null}
    </div>
  );
}
