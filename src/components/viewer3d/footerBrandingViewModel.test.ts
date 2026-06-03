import { describe, expect, it } from 'vitest';
import { SIZE } from '../../theme';
import { getFooterLogoImageStyle } from './footerBrandingViewModel';

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
});
