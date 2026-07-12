import { describe, expect, it } from 'vitest';
import {
  ESSENTIAL_FLY_NAV_IDS,
  ESSENTIAL_FLY_NAV_ROW_ID,
  ESSENTIAL_HOTKEY_IDS,
  ESSENTIAL_IMAGE_NAV_IDS,
  ESSENTIAL_IMAGE_NAV_ROW_ID,
  ESSENTIAL_MOUSE_ROWS,
  ESSENTIAL_WASD_IDS,
  ESSENTIAL_WASD_ROW_ID,
  HOTKEYS,
  formatKeyCombo,
} from './hotkeys';

function comboScopePairs() {
  return Object.entries(HOTKEYS).flatMap(([id, def]) =>
    def.keys.split(',').map((k) => ({ id, combo: k.trim().toLowerCase(), scopes: def.scopes }))
  );
}

describe('HOTKEYS registry', () => {
  it('binds i to the help panel and carries no fossil image-load entry', () => {
    expect(HOTKEYS.showHelp.keys).toBe('shift+/, i');
    // cycleImageLoad was a dead registry entry: the imageLoadMode feature was
    // removed long ago (persistedStoreMigrations still deletes its state) and
    // no handler ever bound it, so the help panel was advertising a no-op
    // shortcut (codex release-gate P1). The id must stay gone.
    expect('cycleImageLoad' in HOTKEYS).toBe(false);
  });

  it('never binds the same combo twice within overlapping scopes', () => {
    const pairs = comboScopePairs();
    const collisions: string[] = [];
    for (let a = 0; a < pairs.length; a++) {
      for (let b = a + 1; b < pairs.length; b++) {
        const sameCombo = pairs[a].combo === pairs[b].combo;
        const scopesOverlap = pairs[a].scopes.some((s) => pairs[b].scopes.includes(s));
        if (sameCombo && scopesOverlap) {
          collisions.push(`${pairs[a].id} vs ${pairs[b].id}: ${pairs[a].combo}`);
        }
      }
    }
    expect(collisions).toEqual([]);
  });
});

describe('ESSENTIAL_HOTKEY_IDS', () => {
  it('references only registry ids plus the composite WASD/image-nav/fly-nav and mouse rows', () => {
    const syntheticIds = new Set<string>([
      ESSENTIAL_WASD_ROW_ID,
      ESSENTIAL_IMAGE_NAV_ROW_ID,
      ESSENTIAL_FLY_NAV_ROW_ID,
      ...ESSENTIAL_MOUSE_ROWS.map((row) => row.id),
    ]);
    const missing = ESSENTIAL_HOTKEY_IDS.filter((id) => !syntheticIds.has(id) && !(id in HOTKEYS));
    expect(missing).toEqual([]);
  });

  it('maps, in order, to the curated combos (keys, view controls, pointer rows, image-modal rows)', () => {
    // Recomputed from the registry rather than trusting any external claim:
    // the user asked for u, b, navigate-WASD, o, p up front, then flagged the
    // missing view-control family (reset, orbit/fly, horizon lock, grid), then
    // the pointer interactions, then the image-modal shortcuts merged in from
    // the removed Image Modal tab.
    const comboFor = (id: string) => {
      if (id === ESSENTIAL_WASD_ROW_ID) return 'wasd';
      if (id === ESSENTIAL_IMAGE_NAV_ROW_ID) return 'arrows';
      if (id === ESSENTIAL_FLY_NAV_ROW_ID) return 'shift-arrows';
      const mouseRow = ESSENTIAL_MOUSE_ROWS.find((row) => row.id === id);
      return mouseRow ? mouseRow.keyCombo : HOTKEYS[id].keys;
    };
    expect(ESSENTIAL_HOTKEY_IDS.map(comboFor)).toEqual([
      'u',
      'b',
      'wasd',
      'o',
      'p',
      'r',
      'c',
      'h',
      'g',
      'click',
      'right click',
      'alt+scroll',
      'ctrl+scroll',
      'arrows',
      'shift-arrows',
      'escape',
    ]);
  });

  it('backs the composite fly-nav row with the real shift+arrow registry entries', () => {
    // The binding itself lives in the gallery keyboard listener (mounted even
    // while the panel is collapsed); the registry entries document it.
    expect(ESSENTIAL_FLY_NAV_IDS.map((id) => HOTKEYS[id].keys)).toEqual([
      'shift+left',
      'shift+right',
    ]);
  });

  it('renders arrow glyphs inside modifier combos', () => {
    expect(formatKeyCombo('left')).toBe('←');
    expect(formatKeyCombo('shift+left')).toBe('Shift + ←');
    expect(formatKeyCombo('shift+right')).toBe('Shift + →');
    // Non-arrow combos are untouched.
    expect(formatKeyCombo('ctrl+scroll')).toBe('Ctrl + scroll');
  });

  it('backs the composite Navigate row with the real WASD registry entries', () => {
    expect(ESSENTIAL_WASD_IDS.map((id) => HOTKEYS[id].keys)).toEqual(['w', 'a', 's', 'd']);
  });

  it('backs the composite image-nav row with the real prev/next registry entries', () => {
    expect(ESSENTIAL_IMAGE_NAV_IDS.map((id) => HOTKEYS[id].keys)).toEqual(['left', 'right']);
  });

  it('describes the mouse rows as select / go-to camera interactions', () => {
    // Display-only rows (pointer handling lives in the viewer, not the registry):
    // left click selects a camera frustum, right click flies into its view.
    expect(ESSENTIAL_MOUSE_ROWS).toEqual([
      { id: 'mouseSelectCamera', description: 'Select camera', keyCombo: 'click' },
      { id: 'mouseGoToCamera', description: 'Go to camera view', keyCombo: 'right click' },
    ]);
  });
});
