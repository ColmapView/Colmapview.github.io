# Panel style survey

Reviewed September 6, 2026. Refined to use the user-preferred Load Dataset panel as the visual reference.

| Panel family | Findings and treatment |
| --- | --- |
| Toolbar panels (settings, export, camera, alignment, display) | Already share `controlPanelStyles`. Use the shared floating surface and title typography; match the Load Dataset panel with a muted secondary surface, subtle outer border, and no drop shadow. Keep their compact controls and 16px inset. |
| Floating tool windows (deletion, conversion, floor detection, auto-hide) | Already share modal headers and shell sizing. Consolidate their surface into the same theme token. Keep drag behavior and responsive widths. |
| Help / About and splat picker | Keep the established flat headers, shared close control, and scrolling bodies. Replace duplicate surface strings with the shared theme token. Normalize heading margins so semantic headings do not add browser-default spacing. |
| URL loading | Replace the separate 20px padded layout with the standard header, title, close control, and 16px content inset. Remove the 400px minimum width; constrain width and height to the viewport and scroll expanded help within the body. |
| Distance / floor alignment confirmation strips | Match floating-panel corners, muted surface, and subtle border. Keep compact padding appropriate for inline confirmation controls. |
| Startup | Retain the recently refined header, browse target, and three actions. Its subdued surface and dashed drop target communicate file loading. |
| Image detail / data panels | Retain image canvas and table framing, dense toolbars, and touch-specific controls. These are persistent work surfaces rather than floating settings cards. |
| Context menus and tooltips | Global and object menus, gallery/viewer hover cards, mouse hints, histogram and cache popovers all use the shared surface. Remove local radius overrides and shadows. |
| Profile menus | Both startup profile dropdown and settings profile selector use the shared surface, retaining their placement and selection behavior. |
| Confirmation dialogs | Use the shared surface, 16px inset, and semibold title; retain danger colors and cancel-first focus. |
| Notifications | Both notification toasts and legacy toast surfaces use the same opaque background, subtle border, and rounded corners. |
| Mobile gallery drawer | Use the secondary background and fine edge divider without the old heavy shadow. Keep square viewport edges and full-height layout. |
| Startup format info | Use the shared surface instead of a separate elevated background and shadow. |

## Maintenance

Use `floatingPanelStyles.surface` for floating cards and `floatingPanelStyles.dialog`
for dialog shells, including startup. Both use the same secondary background, large
corner radius, subtle border, and no drop shadow. Titles use semibold weight;
compact panels retain 14px type and 16px insets so controls stay usable. Use `modalStyles.popupHeader`, `toolHeaderTitle`, and
`toolHeaderClose` for dialog chrome; draggable windows use `toolHeader`.
Use `controlPanelStyles` for toolbar popovers. Avoid adding local header backgrounds,
dividers, arbitrary title sizes, or fixed minimum widths to individual dialogs.

Preserve distinct spacing for dense menus, confirmation strips, and full work surfaces.
Primary actions keep their existing emphasis; destructive actions retain their warning colors.

## Coverage follow-up

Checked all families in `src/components/ui/popupLayerInventory.ts`, plus the splat
picker and startup format popup. Remaining tertiary fills are controls, progress
tracks, nested help content, table chrome, or inline cards rather than popup shells.
Viewport-attached drawers retain square edges; floating panels share rounded corners.

## Spacing and border audit

Audited shared shells and all popup-inventory families for border width, heading
margins, title weight, padding, and dismiss controls. Corrected the directional
border utilities: top/right/bottom/left and axis borders now set only those edges'
styles, preventing browser-default 3px borders on unintended edges. Explicit 2px
selection indicators and dashed drag targets retain their intended emphasis.

Removed native heading top margins in the touch startup and confirmation dialog.
Aligned histogram, cache, hover-card, and image-detail title weights with the shared
semibold style. Touch image-detail dismissal uses the shared close treatment and
retains its 44px minimum target. Legacy modal header aliases now follow the shared
flat header instead of preserving a separate divider-bearing variant.

Floating surfaces use a 1px outline and 8px corners. Insets remain 16px for compact
panels and 24px for the desktop startup; menus and confirmation strips retain dense
spacing, and viewport-attached drawers remain square at screen edges. Browser
regression checks cover directional borders on both divs and buttons, including
combined classes, plus the actual status-bar divider.

## Guide-based refinement

Compared startup, URL loading, Settings, Export, and supporting feedback against
`design-system.md`. Export section labels now use the shared compact section-label
recipe and spacing ladder. Global loading and export progress share a rounded track
and semantic accent fill; loading text uses the standard small text hierarchy.
Export progress exposes its value to assistive technology. Startup action guidance
is available on keyboard focus as well as hover, with Escape and blur dismissal.
