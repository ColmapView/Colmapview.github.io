import { describe, expect, it } from 'vitest';
import { HOTKEYS } from './hotkeys';

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
