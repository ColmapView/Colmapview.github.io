import { describe, expect, it } from 'vitest';
import {
  CONTROL_PANEL_HEIGHT_CHANGE_THRESHOLD,
  CONTROL_PANEL_STATUS_BAR_CLEARANCE,
  getControlPanelAdjustedTop,
  getControlPanelWrapperStyle,
  getControlButtonAccessibleLabel,
  getControlButtonTouchAction,
  hasControlPanelHeightChangedSignificantly,
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

  it('filters panel repositioning when height changes are below the jitter threshold', () => {
    expect(CONTROL_PANEL_HEIGHT_CHANGE_THRESHOLD).toBe(5);
    expect(hasControlPanelHeightChangedSignificantly(100, 0)).toBe(true);
    expect(hasControlPanelHeightChangedSignificantly(104, 100)).toBe(false);
    expect(hasControlPanelHeightChangedSignificantly(105, 100)).toBe(true);
    expect(hasControlPanelHeightChangedSignificantly(94, 100)).toBe(true);
  });

  it('computes panel top adjustment from viewport and status bar clearance', () => {
    expect(CONTROL_PANEL_STATUS_BAR_CLEARANCE).toBe(48);
    expect(getControlPanelAdjustedTop({ bottom: 700 }, 800)).toBeNull();
    expect(getControlPanelAdjustedTop({ bottom: 760 }, 800)).toBe(-8);
    expect(getControlPanelAdjustedTop({ bottom: 820 }, 800)).toBe(-68);
    expect(getControlPanelAdjustedTop({ bottom: 760 }, 800, 20)).toBeNull();
  });

  it('returns wrapper style only when the panel has an adjusted top', () => {
    expect(getControlPanelWrapperStyle(null)).toBeUndefined();
    expect(getControlPanelWrapperStyle(-24)).toEqual({ top: -24 });
  });
});
