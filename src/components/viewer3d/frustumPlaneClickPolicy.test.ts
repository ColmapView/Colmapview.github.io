import { describe, expect, it } from 'vitest';
import {
  getFrustumPlaneClickAction,
  shouldEnableFrustumPlaneContextMenu,
} from './frustumPlaneClickPolicy';

describe('frustum plane click policy', () => {
  it('disables click handling when interactions are disabled', () => {
    expect(getFrustumPlaneClickAction({
      disabled: true,
      touchMode: false,
    })).toBe('disabled');
  });

  it('stops synthetic clicks in touch mode without selecting', () => {
    expect(getFrustumPlaneClickAction({
      disabled: false,
      touchMode: true,
    })).toBe('stopPropagation');
  });

  it('selects the plane for desktop clicks', () => {
    expect(getFrustumPlaneClickAction({
      disabled: false,
      touchMode: false,
    })).toBe('select');
  });

  it('enables the context menu only for active desktop interactions', () => {
    expect(shouldEnableFrustumPlaneContextMenu({
      disabled: false,
      touchMode: false,
    })).toBe(true);
    expect(shouldEnableFrustumPlaneContextMenu({
      disabled: true,
      touchMode: false,
    })).toBe(false);
    expect(shouldEnableFrustumPlaneContextMenu({
      disabled: false,
      touchMode: true,
    })).toBe(false);
  });
});
