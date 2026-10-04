import { describe, expect, it } from 'vitest';
import {
  getControlPanelPosition,
  getControlButtonAccessibleLabel,
  getControlButtonTouchAction,
  hasControlButtonPanel,
  shouldListenForOutsideTouch,
  shouldShowControlButtonPanel,
} from './controlButtonPolicy';

describe('control button policy helpers', () => {
  it('detects whether a control button has a panel', () => {
    expect(hasControlButtonPanel('View', 'children')).toBe(true);
    expect(hasControlButtonPanel('View', null)).toBe(false);
    expect(hasControlButtonPanel(undefined, 'children')).toBe(false);
    expect(hasControlButtonPanel('', 'children')).toBe(false);
  });

  it('adds disabled context to accessible labels', () => {
    expect(getControlButtonAccessibleLabel('Export', false)).toBe('Export');
    expect(getControlButtonAccessibleLabel('Export', true)).toBe('Export (no data loaded)');
  });

  it('chooses touch actions for disabled, direct, closed-panel, and open-panel buttons', () => {
    expect(getControlButtonTouchAction({
      disabled: true,
      hasPanel: false,
      isHovered: false,
    })).toBe('none');

    expect(getControlButtonTouchAction({
      disabled: false,
      hasPanel: false,
      isHovered: false,
    })).toBe('execute-click');

    expect(getControlButtonTouchAction({
      disabled: false,
      hasPanel: true,
      isHovered: false,
    })).toBe('open-panel');

    expect(getControlButtonTouchAction({
      disabled: false,
      hasPanel: true,
      isHovered: true,
    })).toBe('execute-click');
  });

  it('listens for outside touches only for open touch panels', () => {
    expect(shouldListenForOutsideTouch({
      contextMenuOpen: false,
      touchMode: true,
      isHovered: true,
      hasPanel: true,
    })).toBe(true);
    expect(shouldListenForOutsideTouch({
      contextMenuOpen: false,
      touchMode: false,
      isHovered: true,
      hasPanel: true,
    })).toBe(false);
    expect(shouldListenForOutsideTouch({
      contextMenuOpen: false,
      touchMode: true,
      isHovered: false,
      hasPanel: true,
    })).toBe(false);
    expect(shouldListenForOutsideTouch({
      contextMenuOpen: false,
      touchMode: true,
      isHovered: true,
      hasPanel: false,
    })).toBe(false);
    expect(shouldListenForOutsideTouch({
      contextMenuOpen: true,
      touchMode: true,
      isHovered: true,
      hasPanel: true,
    })).toBe(false);
  });

  it('shows panels only when available, hovered, enabled, and not covered by a context menu', () => {
    expect(shouldShowControlButtonPanel({
      contextMenuOpen: false,
      hasPanel: true,
      isHovered: true,
      disabled: false,
    })).toBe(true);
    expect(shouldShowControlButtonPanel({
      contextMenuOpen: false,
      hasPanel: false,
      isHovered: true,
      disabled: false,
    })).toBe(false);
    expect(shouldShowControlButtonPanel({
      contextMenuOpen: false,
      hasPanel: true,
      isHovered: false,
      disabled: false,
    })).toBe(false);
    expect(shouldShowControlButtonPanel({
      contextMenuOpen: false,
      hasPanel: true,
      isHovered: true,
      disabled: true,
    })).toBe(false);
    expect(shouldShowControlButtonPanel({
      contextMenuOpen: true,
      hasPanel: true,
      isHovered: true,
      disabled: false,
    })).toBe(false);
  });

  it('opens over the gallery when a narrow scene has no room to the left', () => {
    const position = getControlPanelPosition({ left: 111, right: 143, top: 240 }, { width: 212, height: 420 }, { width: 390, height: 844 });
    expect(position).toEqual({ left: 143, top: 240, opensRight: true, maxWidth: 374, maxHeight: 780 });
    expect(position.left + 212).toBeLessThanOrEqual(390 - 8);
  });

  it('keeps left-opening panels above the status bar', () => {
    expect(getControlPanelPosition({ left: 850, right: 878, top: 400 }, { width: 248, height: 500 }, { width: 1280, height: 720 }))
      .toEqual({ left: 602, top: 164, opensRight: false, maxWidth: 1264, maxHeight: 656 });
  });

  it('constrains oversized panels to a small viewport without a negative position', () => {
    expect(getControlPanelPosition({ left: 100, right: 128, top: 20 }, { width: 248, height: 600 }, { width: 200, height: 300 }))
      .toEqual({ left: 8, top: 8, opensRight: false, maxWidth: 184, maxHeight: 236 });
  });

  it('uses the visible viewport bounds when a keyboard or zoom pans and shrinks the screen', () => {
    expect(getControlPanelPosition(
      { left: 210, right: 242, top: 450 },
      { width: 212, height: 429 },
      { width: 390, height: 320, offsetLeft: 100, offsetTop: 200 }
    )).toEqual({ left: 242, top: 208, opensRight: true, maxWidth: 374, maxHeight: 256 });
  });
});
