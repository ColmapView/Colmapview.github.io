import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Z_INDEX } from './zIndex';

describe('z-index scale', () => {
  it('pins the current layer values as the migration baseline', () => {
    expect(Z_INDEX).toEqual({
      controls: 10,
      dropdown: 100,
      sticky: 200,
      overlay: 500,
      touchDrawerBackdrop: 997,
      touchDrawer: 998,
      fab: 999,
      modal: 1000,
      contextMenu: 2100,
      toast: 1100,
      modalOverlay: 1200,
      tooltip: 2000,
      mouseTooltip: 9999,
    });
  });

  it('keeps blocking dialogs above notifications and notifications above tool windows', () => {
    expect(Z_INDEX.modalOverlay).toBeGreaterThan(Z_INDEX.toast);
    expect(Z_INDEX.toast).toBeGreaterThan(Z_INDEX.modal);
  });

  it('keeps context menus above viewer hover panels', () => {
    expect(Z_INDEX.contextMenu).toBeGreaterThan(Z_INDEX.tooltip);
  });

  it('keeps mouse-following tooltips above context menus', () => {
    expect(Z_INDEX.mouseTooltip).toBeGreaterThan(Z_INDEX.contextMenu);
  });

  // The .z-* utility classes read --z-* custom properties, so index.css carries a
  // second copy of the scale. Any --z-<name> that also exists as a Z_INDEX key must
  // agree with it; vars with no TS counterpart (e.g. --z-base) are CSS-only.
  it('matches the --z-* custom properties in index.css', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');
    const mismatches: string[] = [];
    let checked = 0;

    for (const [, name, value] of css.matchAll(/--z-([\w-]+)\s*:\s*(\d+)\s*;/g)) {
      const key = name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      if (!(key in Z_INDEX)) continue;
      checked += 1;
      const expected = Z_INDEX[key as keyof typeof Z_INDEX];
      if (Number(value) !== expected) {
        mismatches.push(`--z-${name}: ${value} != Z_INDEX.${key}: ${expected}`);
      }
    }

    expect(mismatches).toEqual([]);
    expect(checked).toBeGreaterThan(0);
  });
});
