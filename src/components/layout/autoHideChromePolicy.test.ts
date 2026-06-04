import { describe, expect, it } from 'vitest';
import { shouldHideChromeWithButtons } from './autoHideChromePolicy';

describe('auto-hide chrome policy', () => {
  it('hides chrome only when button auto-hide is active', () => {
    expect(shouldHideChromeWithButtons({
      autoHideButtons: true,
      isIdle: true,
      showAutoHideEditor: false,
    })).toBe(true);

    expect(shouldHideChromeWithButtons({
      autoHideButtons: true,
      isIdle: false,
      showAutoHideEditor: true,
    })).toBe(true);

    expect(shouldHideChromeWithButtons({
      autoHideButtons: false,
      isIdle: true,
      showAutoHideEditor: true,
    })).toBe(false);

    expect(shouldHideChromeWithButtons({
      autoHideButtons: true,
      isIdle: false,
      showAutoHideEditor: false,
    })).toBe(false);
  });
});
