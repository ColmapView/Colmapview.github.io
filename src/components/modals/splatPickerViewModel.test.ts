import { describe, it, expect } from 'vitest';
import {
  formatSplatSize,
  getSplatPickerDescription,
  getSplatPickerItems,
  getSplatPickerOverlayStyle,
  getSplatPickerPanelStyle,
  SPLAT_PICKER_NONE_ROW_CLASS,
  SPLAT_PICKER_ROW_CLASS,
  SPLAT_PICKER_SIZE_CLASS,
} from './splatPickerViewModel';
import { Z_INDEX } from '../../theme/zIndex';

describe('formatSplatSize', () => {
  it('formats MB and GB sizes', () => {
    expect(formatSplatSize(91_129_131)).toBe('91 MB');
    expect(formatSplatSize(4_302_304_393)).toBe('4.3 GB');
    expect(formatSplatSize(500_000)).toBe('500 KB');
  });

  it('returns empty string for missing/invalid sizes', () => {
    expect(formatSplatSize(undefined)).toBe('');
    expect(formatSplatSize(0)).toBe('');
    expect(formatSplatSize(Number.NaN)).toBe('');
  });
});

describe('getSplatPickerItems', () => {
  it('uses the file basename and a formatted size', () => {
    expect(
      getSplatPickerItems(
        [
          { id: 'splats/5x5#-5_-15_0_-10#-1_-3.ply', path: 'splats/5x5#-5_-15_0_-10#-1_-3.ply', url: 'u', size: 942_559_508 },
          { id: 'inside.ply', path: 'inside.ply', url: 'u', size: 46_348_763 },
        ],
        { isTouchDevice: false }
      )
    ).toEqual([
      { id: 'inside.ply', name: 'inside.ply', sizeLabel: '46 MB', tier: 'ok', warning: null, disabledReason: null },
      { id: 'splats/5x5#-5_-15_0_-10#-1_-3.ply', name: '5x5#-5_-15_0_-10#-1_-3.ply', sizeLabel: '943 MB', tier: 'ok', warning: null, disabledReason: null },
    ]);
  });

  it('lists splats by size, smallest first, so the user chooses between formats', () => {
    const items = getSplatPickerItems([
      { id: 'big.ply', path: 'big.ply', size: 300 },
      { id: 'small.sog', path: 'small.sog', size: 20 },
      { id: 'mid.spz', path: 'mid.spz', size: 90 },
      { id: 'unknown.ply', path: 'unknown.ply' },
    ], { isTouchDevice: false });
    expect(items.map((item) => item.id)).toEqual(['small.sog', 'mid.spz', 'big.ply', 'unknown.ply']);
  });

  it('lists a zero size (a blocked HEAD on a static host) last, with the other unknown sizes', () => {
    const items = getSplatPickerItems([
      { id: 'b-blocked.ply', path: 'b-blocked.ply', size: 0 },
      { id: 'known.sog', path: 'known.sog', size: 20 },
      { id: 'a-unknown.ply', path: 'a-unknown.ply' },
    ], { isTouchDevice: false });
    expect(items.map((item) => item.id)).toEqual(['known.sog', 'a-unknown.ply', 'b-blocked.ply']);
  });
});

describe('splat picker device tiers', () => {
  const sources = [
    { id: 'a', path: 'splats/huge.ply', url: 'u', size: 1_040_000_634, splatCount: 10_000_000 },
    { id: 'b', path: 'splats/mid.spz', url: 'u', size: 55_000_000, splatCount: 2_000_000 },
    { id: 'c', path: 'splats/small.spz', url: 'u', size: 40_000_000, splatCount: 1_000_000 },
  ];

  it('maps sources to ok/hint/disabled tiers on touch hardware', () => {
    const items = getSplatPickerItems(sources, { isTouchDevice: true });
    const byId = new Map(items.map((item) => [item.id, item]));
    expect(items.map((i) => i.id)).toEqual(['c', 'b', 'a']);
    expect(byId.get('a')?.tier).toBe('disabled');
    expect(byId.get('a')?.disabledReason).toBe('Too large for this device (1.0 GB) - open on a desktop to view');
    expect(byId.get('b')?.warning).toBe("may exceed this device's memory");
    expect(byId.get('c')?.warning).toBeNull();
  });

  it('leaves everything ok on desktop', () => {
    for (const item of getSplatPickerItems(sources, { isTouchDevice: false })) {
      expect(item.tier).toBe('ok');
      expect(item.disabledReason).toBeNull();
    }
  });

  it('applies the raised byte-less ceiling only to formats the WebGPU decoder reads', () => {
    const items = getSplatPickerItems([
      { id: 'a.ply', path: 'a.ply', size: 40_000_000, splatCount: 3_500_000 },
      { id: 'b.sog', path: 'b.sog', size: 40_000_000, splatCount: 3_500_000 },
    ], { isTouchDevice: true, byteLessLoaderAvailable: true });
    expect(items.find((item) => item.id === 'a.ply')?.tier).not.toBe('disabled');
    expect(items.find((item) => item.id === 'b.sog')?.tier).toBe('disabled');
  });
});

describe('getSplatPickerDescription', () => {
  it('pluralizes for multiple splats', () => {
    expect(getSplatPickerDescription(3))
      .toBe('3 splats found. Pick one to load, or keep the COLMAP scene.');
  });

  it('uses singular phrasing for a lone non-auto-loaded splat', () => {
    expect(getSplatPickerDescription(1))
      .toBe('1 splat found. Pick it to load, or keep the COLMAP scene.');
  });
});

describe('splat picker styles', () => {
  it('places the overlay above the loading overlay', () => {
    expect(getSplatPickerOverlayStyle()).toEqual({ zIndex: Z_INDEX.modalOverlay });
    expect(Z_INDEX.modalOverlay).toBeGreaterThan(Z_INDEX.overlay);
  });

  it('caps the panel to the viewport so the list scrolls internally', () => {
    // Arbitrary viewport-unit Tailwind utilities are not generated in this
    // project, so these dimensions must be applied as inline styles.
    expect(getSplatPickerPanelStyle()).toEqual({ maxWidth: '90vw', maxHeight: '70vh' });
  });
});

describe('splat picker row classes (no Tailwind no-ops)', () => {
  const rowClasses = [SPLAT_PICKER_NONE_ROW_CLASS, SPLAT_PICKER_ROW_CLASS, SPLAT_PICKER_SIZE_CLASS];

  it('avoid Tailwind-style classes that are silent no-ops in this project', () => {
    for (const cls of rowClasses) {
      expect(cls).not.toMatch(/hover:/); // colon-form hover is undefined here
      expect(cls).not.toMatch(/(^|\s)shrink-0(\s|$)/); // must be flex-shrink-0
      expect(cls).not.toMatch(/\[/); // no arbitrary bracket utilities
    }
  });

  it('give the clickable rows a real hover affordance', () => {
    expect(SPLAT_PICKER_NONE_ROW_CLASS).toContain('hover-ds-hover');
    expect(SPLAT_PICKER_ROW_CLASS).toContain('hover-ds-hover');
    expect(SPLAT_PICKER_ROW_CLASS).toContain('cursor-pointer');
  });

  it('keeps the size label from shrinking', () => {
    expect(SPLAT_PICKER_SIZE_CLASS).toContain('flex-shrink-0');
  });
});
