import { describe, expect, it } from 'vitest';
import { Z_INDEX } from '../../theme';
import {
  getConfirmationDialogClass,
  getConfirmationDialogStyle,
  getConfirmationOverlayStyle,
} from './confirmationHostPolicy';

describe('confirmation host policy', () => {
  it('keeps confirmations above pointer-following UI', () => {
    expect(getConfirmationOverlayStyle()).toEqual({
      zIndex: Z_INDEX.mouseTooltip + 1,
    });
  });

  it('uses inline max width values for confirmation sizes', () => {
    expect(getConfirmationDialogClass()).toContain('w-full');
    expect(getConfirmationDialogStyle()).toEqual({ maxWidth: 420 });
    expect(getConfirmationDialogStyle('compact')).toEqual({ maxWidth: 340 });
  });
});
