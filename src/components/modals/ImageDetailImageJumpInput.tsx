import type { KeyboardEvent } from 'react';
import type { ImageId } from '../../types/colmap';
import {
  getImageJumpInputKeyAction,
  getImageJumpInputState,
} from './imageDetailControlsViewModel';

interface ImageDetailImageJumpInputProps {
  imageDetailId: ImageId | null;
  imageCount: number;
  onOpenImageId: (imageId: ImageId) => void;
  imageExists: (imageId: ImageId) => boolean;
}

export function ImageDetailImageJumpInput({
  imageDetailId,
  imageCount,
  onOpenImageId,
  imageExists,
}: ImageDetailImageJumpInputProps) {
  const inputState = getImageJumpInputState({ imageDetailId, imageCount });

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();

    const target = event.currentTarget;
    const action = getImageJumpInputKeyAction({
      key: event.key,
      value: target.value,
      currentImageId: imageDetailId,
      imageExists,
    });

    if (action.type === 'openAndBlur') {
      onOpenImageId(action.imageId);
      target.blur();
    } else if (action.type === 'resetAndBlur') {
      target.value = action.value;
      target.blur();
    } else if (action.type === 'blur') {
      target.blur();
    }
  };

  return (
    <div className={inputState.containerClassName}>
      <input
        type="text"
        defaultValue={inputState.resetValue}
        key={inputState.inputKey}
        className={inputState.inputClassName}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          event.currentTarget.value = inputState.resetValue;
        }}
      />
      <span className={inputState.countClassName}>
        {inputState.countLabel}
      </span>
    </div>
  );
}
