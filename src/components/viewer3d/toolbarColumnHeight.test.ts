import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readRootTokens, resolveValueToPixels } from '../../test/cssRootTokens';
import { controlPanelStyles, statusBarStyles } from '../../theme';

/**
 * Contract: the control column always fits above the status bar.
 *
 * The toolbar is a fixed-height stack (`absolute top-3 flex flex-col gap-2`)
 * with no max-height and no overflow — and it cannot get one, because
 * `overflow-y` forces `overflow-x` to `auto`, which would clip the hover panels
 * that sit outside its left edge (`right-full`). Its bottom edge therefore grows
 * with every button added, and the last item is the gallery toggle: the only
 * mouse-reachable way to re-open a collapsed gallery (there is no gallery
 * hotkey; the context-menu entry is the only other path).
 *
 * The budget is the viewport height minus the status bar, not the full viewport.
 * StatusBar is `absolute bottom-0 z-sticky` in the ROOT stacking context while
 * the whole toolbar is inside Scene3D's `relative isolate` box, so the toolbar's
 * z-tooltip cannot beat it — anything under the status bar is painted over and
 * takes no clicks.
 *
 * This test re-derives the column height from the toolbar source + the CSS size
 * tiers, so adding a button (or widening a tier) fails here unless the
 * corresponding `@media (max-height: …)` breakpoint moves with it.
 */

const CSS_PATH = resolve(__dirname, '../../index.css');
const TOOLBAR_PATH = resolve(__dirname, 'ViewerControlsToolbar.tsx');
const SHARE_PANEL_PATH = resolve(__dirname, 'panels/SharePanel.tsx');

// Comments are stripped before anything is scanned: they sit between
// declarations (so a `;`-anchored lookup would miss the next property) and
// prose can contain braces, which would derail the balanced-brace block scan.
const css = readFileSync(CSS_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
const toolbarSource = readFileSync(TOOLBAR_PATH, 'utf8');

/** The shortest desktop window in which the whole column must stay reachable. */
const MIN_SUPPORTED_VIEWPORT_HEIGHT = 540;

/**
 * The --sp-* ladder from :root. The spacing utilities read it instead of
 * inlining rems — that indirection is what lets the compact tier re-scale every
 * padding/margin/gap inside a panel from a handful of rung declarations — so a
 * contract that measures a utility has to resolve one hop of `var()` to get a
 * real length back. The parser is shared (src/test/cssRootTokens.ts) and still
 * THROWS on an unresolvable token rather than defaulting: a utility pointing at
 * a rung that :root does not declare is a dead rule, and a silent 0 here would
 * report the column as fitting when it does not.
 */
const rootTokens = readRootTokens();
const toPixels = (value: string): number => resolveValueToPixels(rootTokens, value);

/** First declaration block for `selector` inside `source`. */
function ruleBody(source: string, selector: string): string {
  // The lookahead also rejects `\` so `.gap-2` cannot match inside `.gap-2\.5`.
  const match = source.match(new RegExp(`\\.${selector}(?![\\w\\\\-])\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`No rule for .${selector}`);
  return match[1];
}

function declaration(body: string, property: string): number {
  const match = body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;!]+)`));
  if (!match) throw new Error(`No ${property} declaration in "${body.trim()}"`);
  return toPixels(match[1].trim());
}

/** Utility class value from the top-level (unmediated) part of index.css. */
function utility(selector: string, property: string): number {
  return declaration(ruleBody(css, selector), property);
}

/** Body of `@media (max-height: …)` blocks, keyed by their breakpoint. */
function collectHeightTiers(): { maxHeight: number; button: number; gap: number }[] {
  const tiers: { maxHeight: number; button: number; gap: number }[] = [];
  for (const match of css.matchAll(/@media\s*\(max-height:\s*(\d+)px\)\s*\{/g)) {
    const maxHeight = Number(match[1]);
    // Balanced-brace scan from the block's opening brace.
    let depth = 0;
    let end = match.index! + match[0].length - 1;
    for (let i = end; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') {
        depth -= 1;
        if (depth === 0) { end = i; break; }
      }
    }
    const block = css.slice(match.index!, end);
    tiers.push({
      maxHeight,
      button: declaration(ruleBody(block, 'control-button-responsive'), 'height'),
      gap: declaration(ruleBody(block, 'control-panel-responsive'), 'gap'),
    });
  }
  return tiers.sort((a, b) => b.maxHeight - a.maxHeight);
}

/** Toolbar items, counted from the JSX so the geometry tracks the real column. */
function countToolbarItems(): { buttons: number; dividers: number } {
  const body = toolbarSource.slice(toolbarSource.indexOf('export function ViewerControlsToolbar'));
  const tags = [...body.matchAll(/<([A-Z][A-Za-z0-9]*)/g)].map((match) => match[1]);
  const dividers = tags.filter((tag) => tag === 'ToolbarDivider').length;
  // Count the actual controls rendered by Share, including any sibling controls.
  const shareButtons = [...readFileSync(SHARE_PANEL_PATH, 'utf8').matchAll(/<ControlButton\b/g)].length;
  const buttons = tags.filter(tag => tag !== 'ToolbarDivider')
    .reduce((count, tag) => count + (tag === 'SharePanel' ? shareButtons : 1), 0);
  return { buttons, dividers };
}

const { buttons, dividers } = countToolbarItems();
const topOffset = utility('top-3', 'top');
const baseGap = utility('gap-2', 'gap');
const baseButton = utility('h-10', 'height');
const dividerHeight = utility('h-px', 'height');
const statusBarHeight = utility('h-10', 'height');

/** Viewport height needed for the column's last item to clear the status bar. */
function requiredViewportHeight(button: number, gap: number): number {
  const items = buttons + dividers;
  const bottomEdge = topOffset
    + buttons * button
    + dividers * dividerHeight
    + (items - 1) * gap;
  return bottomEdge + statusBarHeight;
}

describe('control column vertical fit', () => {
  it('derives its geometry from the classes the toolbar actually applies', () => {
    // If any of these tokens change, the arithmetic below is measuring the wrong
    // box — update the lookups rather than the expectations.
    expect(controlPanelStyles.container).toContain('top-3');
    expect(controlPanelStyles.container).toContain('gap-2');
    expect(controlPanelStyles.container).toContain('control-panel-responsive');
    expect(controlPanelStyles.button).toContain('h-10');
    expect(controlPanelStyles.button).toContain('control-button-responsive');
    expect(statusBarStyles.container).toContain('h-10');
    expect(toolbarSource).toContain('h-px'); // ToolbarDivider
    expect(buttons).toBeGreaterThan(0);
  });

  it('has height tiers, not only the width tier (a wide short window needs both)', () => {
    // The `@media (max-width: 1520px)` compact rule does nothing at >=1520px
    // wide, which is exactly where the column is at full 40px pitch.
    expect(collectHeightTiers().length).toBeGreaterThan(0);
  });

  it('fits above the status bar at every viewport height down to the floor', () => {
    const tiers = collectHeightTiers();

    // Just above the tallest breakpoint the full-size column applies.
    expect(requiredViewportHeight(baseButton, baseGap))
      .toBeLessThanOrEqual(tiers[0].maxHeight + 1);

    // Just above each subsequent breakpoint, the previous tier applies.
    for (let i = 0; i < tiers.length - 1; i += 1) {
      expect(requiredViewportHeight(tiers[i].button, tiers[i].gap))
        .toBeLessThanOrEqual(tiers[i + 1].maxHeight + 1);
    }

    // The smallest tier carries everything from the floor up to its breakpoint.
    const smallest = tiers[tiers.length - 1];
    expect(requiredViewportHeight(smallest.button, smallest.gap))
      .toBeLessThanOrEqual(Math.min(MIN_SUPPORTED_VIEWPORT_HEIGHT, smallest.maxHeight));
  });
});
