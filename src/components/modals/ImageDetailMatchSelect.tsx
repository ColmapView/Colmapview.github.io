import type { WheelEvent } from 'react';
import type { ImageId } from '../../types/colmap';
import type { ConnectedImageOption } from './imageDetailViewModel';
import {
  getImageDetailMatchSelectState,
  parseOptionalImageId,
} from './imageDetailControlsViewModel';

interface ImageDetailMatchSelectProps {
  variant: 'touch' | 'desktop';
  matchedImageId: ImageId | null;
  connectedImages: ConnectedImageOption[];
  setMatchedImageId: (imageId: ImageId | null) => void;
  onWheel?: (event: WheelEvent<HTMLSelectElement>) => void;
}

export function ImageDetailMatchSelect({
  variant,
  matchedImageId,
  connectedImages,
  setMatchedImageId,
  onWheel,
}: ImageDetailMatchSelectProps) {
  const selectState = getImageDetailMatchSelectState({
    variant,
    matchedImageId,
    connectedImages,
  });
  const style = selectState.minHeight === undefined ? undefined : { minHeight: selectState.minHeight };

  return (
    <select
      value={selectState.value}
      onChange={(event) => setMatchedImageId(parseOptionalImageId(event.target.value))}
      onWheel={onWheel}
      className={selectState.className}
      style={style}
    >
      <option value="">{selectState.placeholderLabel}</option>
      {selectState.options.map(({ value, label }) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
