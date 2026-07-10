import { describe, expect, it } from 'vitest';
import {
  ESSENTIAL_HOTKEY_IDS,
  ESSENTIAL_MOUSE_ROWS,
  ESSENTIAL_WASD_IDS,
  ESSENTIAL_WASD_ROW_ID,
  HOTKEYS,
} from './hotkeys';

function comboScopePairs() {
  return Object.entries(HOTKEYS).flatMap(([id, def]) =>
    def.keys.split(',').map((k) => ({ id, combo: k.trim().toLowerCase(), scopes: def.scopes }))
  );
}

describe('HOTKEYS registry', () => {
  it('binds i to the help panel and l to image-load cycling', () => {
    expect(HOTKEYS.showHelp.keys).toBe('shift+/, i');
    expect(HOTKEYS.cycleImageLoad.keys).toBe('l');
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
  it('references only registry ids plus the composite WASD and mouse rows', () => {
    const syntheticIds = new Set<string>([
      ESSENTIAL_WASD_ROW_ID,
      ...ESSENTIAL_MOUSE_ROWS.map((row) => row.id),
    ]);
    const missing = ESSENTIAL_HOTKEY_IDS.filter((id) => !syntheticIds.has(id) && !(id in HOTKEYS));
    expect(missing).toEqual([]);
  });

  it('maps, in order, to the curated combos (u, b, WASD, o, p, mouse clicks, scroll combos)', () => {
    // Recomputed from the registry rather than trusting any external claim:
    // the user asked for u, b, navigate-WASD, o, p up front, then the pointer
    // interactions (click select / right-click go-to and the scroll combos).
    const comboFor = (id: string) => {
      if (id === ESSENTIAL_WASD_ROW_ID) return 'wasd';
      const mouseRow = ESSENTIAL_MOUSE_ROWS.find((row) => row.id === id);
      return mouseRow ? mouseRow.keyCombo : HOTKEYS[id].keys;
    };
    expect(ESSENTIAL_HOTKEY_IDS.map(comboFor)).toEqual([
      'u',
      'b',
      'wasd',
      'o',
      'p',
      'click',
      'right click',
      'alt+scroll',
      'ctrl+scroll',
    ]);
  });

  it('backs the composite Navigate row with the real WASD registry entries', () => {
    expect(ESSENTIAL_WASD_IDS.map((id) => HOTKEYS[id].keys)).toEqual(['w', 'a', 's', 'd']);
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
