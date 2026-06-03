import { describe, expect, it } from 'vitest';
import { TOUCH } from '../../theme/sizing';
import { Z_INDEX } from '../../theme/zIndex';
import {
  getTouchFabClassName,
  getTouchFabDiameter,
  getTouchFabIconClassName,
  getTouchFabStyle,
  getTouchFabVariantClassName,
  TOUCH_FAB_BASE_CLASS,
  TOUCH_FAB_POSITION_CLASSES,
  TOUCH_FAB_PRIMARY_CLASS,
  TOUCH_FAB_PRIMARY_ICON_CLASS,
  TOUCH_FAB_SECONDARY_CLASS,
  TOUCH_FAB_SECONDARY_ICON_CLASS,
} from './touchFabPolicy';

describe('touch FAB policy', () => {
  it('derives touch FAB dimensions, icon sizes, and z-index style', () => {
    expect(getTouchFabDiameter('primary')).toBe(TOUCH.minTapTarget);
    expect(getTouchFabDiameter('secondary')).toBe(TOUCH.fabSecondarySize);
    expect(getTouchFabIconClassName('primary')).toBe(TOUCH_FAB_PRIMARY_ICON_CLASS);
    expect(getTouchFabIconClassName('secondary')).toBe(TOUCH_FAB_SECONDARY_ICON_CLASS);
    expect(getTouchFabStyle('secondary')).toEqual({
      width: TOUCH.fabSecondarySize,
      height: TOUCH.fabSecondarySize,
      zIndex: Z_INDEX.fab,
    });
  });

  it('derives position and variant class names', () => {
    expect(TOUCH_FAB_POSITION_CLASSES['top-left']).toBe('top-4 left-4');
    expect(getTouchFabVariantClassName('primary')).toBe(TOUCH_FAB_PRIMARY_CLASS);
    expect(getTouchFabVariantClassName('secondary')).toBe(TOUCH_FAB_SECONDARY_CLASS);
    expect(getTouchFabClassName({
      position: 'bottom-right',
      size: 'primary',
      className: 'extra-class',
    })).toBe([
      TOUCH_FAB_BASE_CLASS,
      'bottom-4 right-4',
      TOUCH_FAB_PRIMARY_CLASS,
      'extra-class',
    ].join(' '));
  });
});
