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
      getSplatPickerItems([
        { id: 'splats/5x5#-5_-15_0_-10#-1_-3.ply', path: 'splats/5x5#-5_-15_0_-10#-1_-3.ply', url: 'u', size: 942_559_508 },
        { id: 'inside.ply', path: 'inside.ply', url: 'u', size: 46_348_763 },
      ])
    ).toEqual([
      { id: 'splats/5x5#-5_-15_0_-10#-1_-3.ply', name: '5x5#-5_-15_0_-10#-1_-3.ply', sizeLabel: '943 MB' },
      { id: 'inside.ply', name: 'inside.ply', sizeLabel: '46 MB' },
    ]);
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
