# Design system

The Load Dataset panel is the visual reference: muted surface, fine outline,
rounded corners, restrained typography, and clear spacing. Preserve this appearance
when adding or changing UI.

## Sources of truth

| Concern | Owner | Rule |
| --- | --- | --- |
| Colors, borders, radii, spacing scale | `src/index.css` root variables | Use semantic CSS variables and existing utilities; this project does not run Tailwind. |
| Colors needed in JavaScript | `src/theme/colors.ts` | Use named values; existing theme tests check agreement with CSS. |
| Geometry needed in JavaScript | `src/theme/spacing.ts`, `sizing.ts` | Use these for measured layouts and touch targets. |
| Panel surfaces and chrome | `src/theme/panelStyles.ts` | Compose `panelStyles`; do not copy its class strings into components. |
| Buttons and action groups | `src/theme/buttonStyles.ts` | Use `buttonStyles`, `actionButtonStyles`, and `getButtonClass`; panel dismissal shares the same close recipe. |
| Tables, menus, notifications | `src/theme/componentStyles.ts` | Use the existing family recipe. Panel-like families compose the canonical surface. |
| Layering and motion | `src/theme/zIndex.ts`, `timing.ts` | Keep interaction and layer policy independent of visual appearance. |

Import styles through `src/theme`. `modalStyles`, `controlPanelStyles`, and
`floatingPanelStyles` remain supported family adapters, not separate design systems.

## Control and feedback modules

- `formStyles.ts`: text fields, selects, numeric fields, native checkbox/range styles, and color-picker controls. Fields share the same border, background, radius, focus treatment, and 14px default text. Explicit compact sizes remain for dense toolbars.
- `selectionStyles.ts`: tabs, compact text tabs, switches, and checkbox groups. Checked state and disabled behavior remain independent of layout density.
- `feedbackStyles.ts`: loading, empty, error, and mobile messages. Error boundaries share icon size, title weight, spacing, and message typography; empty-state actions use the button system.

All remain available through the existing `theme` import. Browser-native range
tracks and thumbs continue using the shared CSS rules in `index.css`; dynamic hue
and scene colors are data, not duplicated theme colors.

## Panel composition

- `surface`: secondary background, 1px neutral border, 8px corners, no shadow.
- `dialog`: the same surface with a vertical flex layout.
- `header` / `draggableHeader`: flat title row, 16px horizontal inset, 8px vertical inset and gap.
- `title`: semibold 14px title with explicit heading margins; `startupTitle` preserves the larger startup title.
- `close`: shared dismiss treatment, 32px desktop and at least 44px for touch.
- `body` / `scrollBody` / `toolBody`: 16px horizontal and 12px vertical padding, with scrolling or group spacing as needed.
- `inset` / `compactInset`: 16px cards or 4px inline confirmation strips.
- `overlay`: shared centered modal backdrop. Z-index and dismissal behavior remain shell responsibilities.

Keep panel width, screen position, dragging, and responsive layout in the component
or shell that owns them. A shared recipe should not impose one size on all panels.

## Controls and hierarchy

Use `buttonStyles` and `inputStyles` for controls. Keep neutral secondary actions,
stronger confirmation actions, and semantic danger/success states. Selected-state
indicators may use 2px borders; panel outlines use 1px. Directional divider utilities
paint only their named edges.

Use the existing spacing ladder: 4, 8, 12, 16, 24, and 32px. CSS uses `--sp-*`
variables; JavaScript geometry uses the matching exported constants. Avoid adding
literal spacing values to individual panel rules.

## Intentional variants

Desktop startup uses a 24px inset (16px on narrow screens). Menus and inline
confirmation strips are denser. Image/data work surfaces retain their functional
toolbars and content frames. Edge-attached drawers remain square against the
viewport. Dashed drop targets, selection outlines, color swatches, and progress
tracks are content indicators rather than panel surfaces.

## Verification

Run lint and relevant component tests after recipe changes. `classContract.test.ts`
checks that referenced utilities exist. `e2e/panel-borders.spec.ts` guards against
unintended borders; `e2e/ui-polish.spec.ts` covers representative surfaces, viewport
fit, scrolling, focus, and mobile behavior. Inspect screenshots after visual changes.

The [panel survey](ui-panel-style-review.md) records coverage and previous fixes;
this document and the referenced source modules define the current system.

## Button audit

Dialog actions use 14px text with a 40px minimum height (44px on coarse pointers),
matching the startup actions' scale. Dense toolbar and panel controls keep their
compact geometry. Full-width and compact actions compose the same primary and
secondary color/hover variants; toggles retain their separate selected state.
Compact confirm/retry/cancel icons occupy centered 24px squares and retain their
semantic colors. Dismiss controls share one recipe across buttons and panels.
Shared buttons use explicit line height and prevent icons from shrinking.

Native `disabled` remains required; disabled classes provide only presentation.
Existing keyboard focus rings and mobile-specific 44px controls remain in force.

## Interaction consistency

Viewer panel triggers expose expanded state and their controlled region. Keyboard
focus opens a panel; focus stays usable inside it even when the pointer leaves.
Escape closes it and restores the trigger, and leaving the group closes it.
Arrow Down reopens a dismissed panel without executing the trigger action.
Tooltips also appear on keyboard focus, preserve existing descriptions, and dismiss
on Escape. Color readouts are native edit buttons usable with Enter or Space.

Screenshot section headings use the same recipe as Settings and Export. Viewer
buttons use the shared disabled recipe. Hue ranges use explicit CSS selectors with
shared track/thumb geometry; their transparent tracks expose the data gradient.
Arbitrary Tailwind selector syntax is rejected by the utility contract check.

### Hardening checks

Tooltips measure their rendered size and clamp to the viewport for mouse and
keyboard anchors. Escape suppresses the current mouse hint until its owner is
left; scroll and resize dismiss stale keyboard anchors. Color editors restore
focus after Enter/Escape and consume those keys before viewer shortcuts run.
Hidden native color inputs expose their focus ring on the visible swatch.

The utility scanner has explicit regression examples for arbitrary selector
variants. Interaction tests cover tooltip dismissal, viewport-edge placement,
and inline edit focus restoration. The short touch-layout browser test selects
`?touch=true` explicitly because Firefox touch emulation alone does not reliably
set coarse-pointer/no-hover media; this tests layout, not device autodetection.

Panel text actions (including Reset, Reload, and Apply) use the standard 40px
minimum height, increasing to 44px on coarse pointers. Disabled actions preserve
their secondary/primary fill and geometry with shared reduced opacity, rather
than switching to the panel surface. Compact icon-only controls remain separate.
