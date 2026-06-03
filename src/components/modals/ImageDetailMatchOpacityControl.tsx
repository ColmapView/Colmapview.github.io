import type { KeyboardEvent, RefObject, WheelEvent } from 'react';
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
  const controlState = getImageDetailMatchOpacityControlState({
    variant: 'touch',
    opacity: matchLineOpacity,
  });

  return (
    <div className={controlState.containerClassName}>
      <span className={controlState.labelClassName}>{controlState.label}</span>
      <input
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
  const controlState = getImageDetailMatchOpacityControlState({
    variant: 'desktop',
    opacity: matchLineOpacity,
    isEditing: isEditingOpacity,
  });

  return (
    <div className={controlState.containerClassName} onWheel={onOpacityWheel}>
      <label className={controlState.labelClassName}>{controlState.label}</label>
      <input
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
          type="text"
          value={opacityInputValue}
          onChange={(event) => setOpacityInputValue(event.target.value)}
          onBlur={onOpacityBlur}
          onKeyDown={onOpacityKeyDown}
          className={controlState.editorInputClassName}
        />
      ) : controlState.showDisplayValue ? (
        <span
          className={controlState.valueClassName}
          onDoubleClick={onOpacityDoubleClick}
          title={controlState.displayValueTitle}
        >
          {controlState.valueLabel}
        </span>
      ) : null}
    </div>
  );
}
