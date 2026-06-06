import { describe, expect, it } from 'vitest';
import { SIZE } from '../../theme';
import {
  FOOTER_BRANDING_CLEAR_STATUS_CLASS_NAME,
  FOOTER_BRANDING_NO_STATUS_CLASS_NAME,
  getFooterBrandingPositionClassName,
  getFooterLogoImageStyle,
} from './footerBrandingViewModel';

describe('footer branding view model', () => {
  it('builds logo image style from the shared sizing token', () => {
    expect(getFooterLogoImageStyle()).toEqual({
      height: SIZE.logoHeight,
    });
  });

  it('allows explicit logo height overrides for focused callers', () => {
    expect(getFooterLogoImageStyle('48px')).toEqual({
      height: '48px',
    });
  });

  it('selects the raised footer position when the floating status bar is visible', () => {
    expect(getFooterBrandingPositionClassName({ clearStatusBar: true })).toBe(
      FOOTER_BRANDING_CLEAR_STATUS_CLASS_NAME
    );
  });

  it('selects the default footer position when no status bar clearance is needed', () => {
    expect(getFooterBrandingPositionClassName({ clearStatusBar: false })).toBe(
      FOOTER_BRANDING_NO_STATUS_CLASS_NAME
    );
  });
});
