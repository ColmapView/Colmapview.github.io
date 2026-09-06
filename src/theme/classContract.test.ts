import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readRootTokens, resolveValueToPixels } from '../test/cssRootTokens';
import { TOUCH } from './sizing';

/**
 * Contract: every utility-class token referenced in TS/TSX must be defined in
 * src/index.css. This project has NO Tailwind — a class only works if a
 * hand-written rule exists. Undefined classes are silent no-ops (see the
 * retro-fix precedent at index.css ~line 889 and docs in CLAUDE.md).
 *
 * The contract stands on its own: a new class must be defined in index.css (or
 * the reference removed) in the same change that introduces it. There is no
 * allowlist — re-introducing one is a deliberate act, not a shortcut.
 */

// Comment prose is not markup. Doc comments here routinely name utilities in
// backticks *because* they do not exist (splatPickerViewModel documents
// `z-[600]` while deliberately applying the z-index inline), and the literal
// scanner cannot tell that prose from a className. The same strip runs over the
// CSS side: a class named only inside a /* … */ note is documentation, not a
// rule, and must not satisfy the contract.
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:\w'"`\\])\/\/[^\n]*/g, '$1');
}

// ---- collect defined classes from index.css ----
const CSS_PATH = resolve(__dirname, '../index.css');

function collectDefinedClasses(): Set<string> {
  const css = stripComments(readFileSync(CSS_PATH, 'utf8'));
  const classes = new Set<string>();
  for (const m of css.matchAll(/\.((?:[\w-]|\\.)+)/g)) {
    classes.add(m[1].replace(/\\(.)/g, '$1'));
  }
  return classes;
}

const defined = collectDefinedClasses();

// ---- collect candidate tokens from source string literals ----
// Deliberately a synchronous fs walk, not `import.meta.glob(..., { eager: true })`:
// the eager glob made Vite transform every file under src/ before this file's body
// could run (~40s), which starved the other fs-walking suites and produced timeout
// failures across the run. Same idiom as components/componentStoreBoundary.test.ts.
const SRC_ROOT = resolve(__dirname, '..');

// Test files are excluded at the walk: they pin class strings verbatim, so
// scanning them would report the same token twice and let a test keep a deleted
// class "referenced". classContract's own source is excluded for the same reason.
function isScannableSource(name: string): boolean {
  if (!name.endsWith('.ts') && !name.endsWith('.tsx')) return false;
  if (name.includes('.test.') || name.includes('.spec.')) return false;
  return !name.startsWith('classContract');
}

function collectSourceFiles(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(entryPath, out);
    } else if (isScannableSource(entry.name)) {
      out.push(entryPath);
    }
  }
  return out;
}

const VARIANT_RE = /^(?:hover|focus|active|disabled|group-hover(?:\/[\w-]+)?):/;
const SINGLE_WORD_UTILITIES = new Set([
  'flex', 'grid', 'hidden', 'block', 'inline', 'truncate', 'relative',
  'absolute', 'fixed', 'sticky', 'static', 'isolate', 'uppercase',
  'capitalize', 'underline', 'rounded', 'border', 'transition', 'sr-only',
  // `contents` (display:contents) joined the set with the toolbar's semantic
  // group wrappers: without it here the token is filtered out at isCandidate,
  // so a missing `.contents` rule would be a silent no-op that turns those
  // wrappers into real flex items and re-spaces the whole column.
  'contents',
]);
const PREFIXES = [
  'bg', 'text', 'border', 'rounded', 'shadow', 'opacity', 'accent',
  'p', 'px', 'py', 'pt', 'pb', 'pl', 'pr',
  'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr', '-m', '-mx', '-my', '-mt', '-mb', '-ml', '-mr',
  'gap', 'space-x', 'space-y', 'w', 'h', 'min-w', 'min-h', 'max-w', 'max-h',
  'z', 'inset', 'top', 'bottom', 'left', 'right', 'translate', '-translate',
  'scale', 'rotate', 'flex', 'inline-flex', 'items', 'justify', 'self',
  'leading', 'font', 'tracking', 'whitespace', 'break', 'overflow',
  'object', 'aspect', 'cursor', 'select', 'pointer-events', 'transition',
  'duration', 'ease', 'animate', 'outline', 'ring', 'backdrop', 'from', 'to',
  'line', 'group', 'focus', 'active', 'shrink', 'grow',
  // Grid track/placement families. Omitting these hid a whole inert layout:
  // ContextMenuEditor asked for `grid-cols-3` + `col-span-3`, neither of which
  // exists, so its outer grid silently collapsed to one column.
  'grid-cols', 'grid-rows', 'col-span', 'row-span', 'col-start', 'row-start',
  // Dash-form variant family (.hover-ds-hover, .hover-bg-ds-accent, …). Bare
  // 'hover' covers every one of them, including composites like
  // .hover-interactive that an enumerated list kept missing.
  'hover',
];

// Enum strings that read as `hover-*` classes but are not markup. Checked before
// the prefix match so the bare 'hover' prefix above stays safe.
const NON_CLASS_TOKENS = new Set(['hover-card']);

// Positional utilities take numeric, fractional, arbitrary or keyword values —
// never direction words. This keeps `bottom-4` / `top-full` in scope while
// rejecting corner-enum strings like 'top-left' / 'bottom-right'.
const POSITIONAL = new Set(['top', 'right', 'bottom', 'left']);
const POSITIONAL_VALUE_RE = /^\d|^\[|^(?:full|auto|px)$/;

function isCandidate(token: string): boolean {
  if (/^\[&.*\]:/.test(token)) return true;
  if (NON_CLASS_TOKENS.has(token)) return false;
  if (token.length < 2 || /[A-Z{}$()=<>'"*]/.test(token)) return false;
  // `border-style:` and friends are CSS property fragments inside style
  // strings/comments, not class tokens.
  if (token.endsWith(':')) return false;
  const base = token.replace(VARIANT_RE, '');
  if (!base) return false;
  // A slash only ever introduces an opacity modifier (`bg-ds-error/20`) or a
  // fraction (`left-1/2`), so the trailing segment must be numeric/arbitrary.
  // Rejects slash-joined prose such as layer notes in popupLayerInventory.
  if (base.includes('/')) {
    const modifier = base.slice(base.lastIndexOf('/') + 1);
    if (!/^\d+$/.test(modifier) && !/^\[[^\]]*\]$/.test(modifier)) return false;
  }
  // Applies to the bare token AND to its variant forms: `hover:underline` must be
  // checked as `underline`, or single-word variants slip past the contract
  // entirely — the exact blind spot this scanner exists to close.
  if (!base.includes('-')) {
    return SINGLE_WORD_UTILITIES.has(base);
  }
  return PREFIXES.some((p) => {
    if (base !== p && !base.startsWith(`${p}-`)) return false;
    if (POSITIONAL.has(p)) return POSITIONAL_VALUE_RE.test(base.slice(p.length + 1));
    return true;
  });
}

function harvest(): Set<string> {
  const tokens = new Set<string>();
  for (const file of collectSourceFiles(SRC_ROOT)) {
    const source = stripComments(readFileSync(file, 'utf8'));
    for (const m of source.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
      const literal = m[1] ?? m[2] ?? m[3] ?? '';
      for (const segment of literal.split(/\$\{[^}]*\}/)) {
        for (const token of segment.split(/\s+/)) {
          if (isCandidate(token)) tokens.add(token);
        }
      }
    }
  }
  return tokens;
}

const found = harvest();

describe('utility class contract', () => {
  it('recognizes unsupported arbitrary selector variants rather than silently skipping them', () => {
    expect(isCandidate('[&::-webkit-slider-thumb]:bg-white')).toBe(true);
    expect(isCandidate('[&:focus-visible]:outline-none')).toBe(true);
  });
  it('every referenced utility class is defined in index.css', () => {
    const missing = [...found].filter((t) => !defined.has(t)).sort();
    expect(missing).toEqual([]);
  });

  it('defines every escaped token verbatim (no Tailwind JIT to expand variants)', () => {
    // The main assertion above already looks tokens up by their FULL name, so
    // today this subset check cannot fail independently. It exists to pin that
    // guarantee explicitly: with no Tailwind, a colon-variant or bracket token
    // (`hover:text-ds-primary`, `w-[3px]`) is only real if index.css defines it
    // under its own escaped name (`.hover\:…` / `.w-\[3px\]`) — if the main
    // lookup is ever loosened (e.g. variant-stripped), this guard must survive.
    const escaped = [...found].filter((t) => t.includes(':') || t.includes('['));
    const missing = escaped.filter((t) => !defined.has(t)).sort();
    expect(missing).toEqual([]);
  });

  it('keeps .rounded-r-none after the .rounded shorthand', () => {
    // Equal specificity: the override only wins on source order (see index.css).
    const css = readFileSync(CSS_PATH, 'utf8');
    expect(css.indexOf('.rounded-r-none')).toBeGreaterThan(css.indexOf('.rounded {'));
  });

  it('keeps the tap-target custom property in sync with TOUCH.minTapTarget', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    expect(css).toContain(`--tap-target-min: ${TOUCH.minTapTarget}px`);
  });
});

/**
 * Contract: spacing utilities read the --sp-* ladder, and the compact tier
 * scales the LADDER rather than listing the utilities that ride it.
 *
 * The `@media (max-width: 1520px)` tier used to compact panels by naming every
 * padding/margin/gap utility a panel happened to contain. That list is open —
 * it grows with the UI — and it had already fallen behind twice: four utilities
 * were retro-fitted once, and `ml-1`, `px-3` and `pr-6` were still sitting at
 * desktop size inside compacted panels when this contract was written. Custom
 * properties inherit, so re-declaring the rungs on the two panel roots compacts
 * every spacing utility inside them, including ones added later. The assertions
 * below keep both halves of that mechanism honest: no utility may inline a
 * literal (a literal is invisible to the tier), and the tier may not re-grow
 * the list it replaced.
 */
describe('spacing ladder contract', () => {
  const rawCss = readFileSync(CSS_PATH, 'utf8');

  const SPACING_UTILITY = /^-?(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y)-/;
  const SPACING_DECLARATION =
    /(?:^|[;{])\s*((?:padding|margin)(?:-top|-right|-bottom|-left)?|gap|row-gap|column-gap)\s*:\s*([^;}]+)/g;
  const LADDER_REFERENCE = /^var\((--sp-(?:[\w-]|\\.)+)\)$/;
  const NEGATED_LADDER_REFERENCE = /^calc\(var\((--sp-(?:[\w-]|\\.)+)\) \* -1\)$/;

  const unescape = (name: string): string => name.replace(/\\(.)/g, '$1');

  /** The hand-written utility block, from the padding heading to the sizing one. */
  function spacingSection(): string {
    const start = rawCss.indexOf('/* Padding */');
    const end = rawCss.indexOf('SIZING UTILITIES');
    if (start < 0 || end <= start) throw new Error('spacing utility section not found');
    return rawCss.slice(start, end);
  }

  /** Balanced-brace body of the compact tier's media query. */
  function compactTier(): string {
    const opener = '@media (max-width: 1520px) {';
    const start = rawCss.indexOf(opener);
    if (start < 0) throw new Error('compact tier media query not found');
    let depth = 0;
    for (let i = start + opener.length - 1; i < rawCss.length; i += 1) {
      if (rawCss[i] === '{') depth += 1;
      else if (rawCss[i] === '}') {
        depth -= 1;
        if (depth === 0) return rawCss.slice(start, i);
      }
    }
    throw new Error('compact tier media query is unbalanced');
  }

  /**
   * :root spacing rungs, in px. Escaped names are resolved (`--sp-1\.5`) by the
   * shared reader (src/test/cssRootTokens.ts). It THROWS on a rung it cannot
   * read; the private parser this replaced stored NaN, which silently satisfied
   * the `value <= ladder.get(name)` comparison below for that rung.
   */
  const rootTokens = readRootTokens();
  const ladder = new Map(
    [...rootTokens]
      .filter(([name]) => name.startsWith('--sp-'))
      .map(([name, value]) => [name, resolveValueToPixels(rootTokens, value)] as const)
  );

  it('parses a full ladder out of :root', () => {
    // Guards the parser itself: an empty map would make everything below vacuous.
    expect(ladder.size).toBeGreaterThan(20);
    expect(ladder.get('--sp-4')).toBe(16);
    expect(ladder.get('--sp-1.5')).toBe(6);
  });

  it('never inlines a spacing literal in the utility layer', () => {
    const inlined: string[] = [];
    for (const match of spacingSection().matchAll(SPACING_DECLARATION)) {
      const value = match[2].trim();
      if (value === 'auto') continue;
      if (LADDER_REFERENCE.test(value) || NEGATED_LADDER_REFERENCE.test(value)) continue;
      inlined.push(`${match[1]}: ${value}`);
    }
    expect(inlined).toEqual([]);
  });

  it('references only rungs that :root declares', () => {
    const dangling: string[] = [];
    for (const match of spacingSection().matchAll(SPACING_DECLARATION)) {
      const value = match[2].trim();
      const reference = LADDER_REFERENCE.exec(value) ?? NEGATED_LADDER_REFERENCE.exec(value);
      if (!reference) continue;
      const name = unescape(reference[1]);
      if (!ladder.has(name)) dangling.push(name);
    }
    expect([...new Set(dangling)].sort()).toEqual([]);
  });

  it('compacts panels by re-declaring the ladder, at or below the desktop rung', () => {
    const declared = new Map<string, number>();
    for (const match of compactTier().matchAll(/(--sp-(?:[\w-]|\\.)+)\s*:\s*([\d.]+)px\s*;/g)) {
      declared.set(unescape(match[1]), Number(match[2]));
    }
    // The rungs the retired enumeration covered — the tier must still reach them.
    expect([...declared.keys()]).toEqual(
      expect.arrayContaining(['--sp-1', '--sp-1.5', '--sp-2', '--sp-3', '--sp-4'])
    );
    const grown = [...declared].filter(([name, value]) => !(value <= (ladder.get(name) ?? -1)));
    expect(grown).toEqual([]);
  });

  it('keeps the tier free of per-utility spacing overrides, bar the documented one', () => {
    // `py-1` opts out on purpose: the panel action buttons keep a real 4px hit
    // area (index.css spells out why). Anything else showing up here means the
    // enumeration the ladder replaced is growing back.
    const overridden = new Set<string>();
    for (const match of compactTier().matchAll(/\.(?:hover-panel|tool-modal)-responsive\s+\.((?:[\w-]|\\.)+)/g)) {
      const token = unescape(match[1]);
      if (SPACING_UTILITY.test(token)) overridden.add(token);
    }
    expect([...overridden].sort()).toEqual(['py-1']);
  });
});
