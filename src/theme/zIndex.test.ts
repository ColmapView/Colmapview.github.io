import { describe, expect, it } from 'vitest';
import { Z_INDEX } from './zIndex';

describe('z-index scale', () => {
  it('pins the current layer values as the migration baseline', () => {
    expect(Z_INDEX).toEqual({
      controls: 10,
      dropdown: 100,
      sticky: 200,
      overlay: 500,
      fab: 999,
      modal: 1000,
      contextMenu: 2100,
      modalOverlay: 1100,
      toast: 1500,
      tooltip: 2000,
      mouseTooltip: 9999,
    });
  });

  it('keeps context menus above viewer hover panels', () => {
    expect(Z_INDEX.contextMenu).toBeGreaterThan(Z_INDEX.tooltip);
  });

  it('keeps mouse-following tooltips above context menus', () => {
    expect(Z_INDEX.mouseTooltip).toBeGreaterThan(Z_INDEX.contextMenu);
  });
});
