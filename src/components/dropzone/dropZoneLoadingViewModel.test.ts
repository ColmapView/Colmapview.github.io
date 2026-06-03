import { describe, expect, it } from 'vitest';
import { getDropZoneProgressFillStyle } from './dropZoneLoadingViewModel';

describe('drop zone loading view model', () => {
  it('builds progress fill width from rounded loading percent', () => {
    expect(getDropZoneProgressFillStyle(42.4)).toEqual({
      width: '42%',
    });
    expect(getDropZoneProgressFillStyle(42.5)).toEqual({
      width: '43%',
    });
  });
});
