import { describe, expect, it } from 'vitest';
import { ESSENTIAL_HOTKEY_IDS, ESSENTIAL_WASD_IDS, ESSENTIAL_WASD_ROW_ID, HOTKEYS } from './hotkeys';

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
  it('references only registry ids plus the composite WASD row', () => {
    const missing = ESSENTIAL_HOTKEY_IDS.filter(
      (id) => id !== ESSENTIAL_WASD_ROW_ID && !(id in HOTKEYS)
    );
    expect(missing).toEqual([]);
  });

  it('maps, in order, to the curated combos (u, b, WASD, o, p, alt+scroll, ctrl+scroll)', () => {
    // Recomputed from the registry rather than trusting any external claim:
    // the user asked for u, b, navigate-WASD, o, p up front plus the scroll combos.
    expect(
      ESSENTIAL_HOTKEY_IDS.map((id) => (id === ESSENTIAL_WASD_ROW_ID ? 'wasd' : HOTKEYS[id].keys))
    ).toEqual(['u', 'b', 'wasd', 'o', 'p', 'alt+scroll', 'ctrl+scroll']);
  });

  it('backs the composite Navigate row with the real WASD registry entries', () => {
    expect(ESSENTIAL_WASD_IDS.map((id) => HOTKEYS[id].keys)).toEqual(['w', 'a', 's', 'd']);
  });
});
