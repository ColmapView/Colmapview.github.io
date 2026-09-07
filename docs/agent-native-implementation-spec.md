# Agent-native implementation specification

Implementation has started. See [current interfaces and remaining coverage](agent-control.md).
The packets below remain the target specification, not a completion claim.

Proposed execution specification, 2026-09-07. Extends
[the product plan](agent-native-plan.md) and [feature contracts](feature-contracts.md).
All new module paths below are proposed. This document does not authorize release
or claim that runtime interfaces have been implemented.

## Execution sizing and agent assignments

Use a primary architecture/integration agent throughout. Assign bounded packets
to implementation agents only when their dependencies and file ownership are clear.
Agent roles below are responsibilities, not a requirement for a particular vendor.
Use medium reasoning for mechanical bindings, high for shared lifecycle/services,
and xhigh for geometry, history, and trust-boundary design. Higher reasoning does
not replace tests or independent review.

Effort estimates count focused implementation/review sessions, not hours or token
budgets: S = 1–2, M = 2–4, L = 4–7, XL = 7–12. These are planning ranges; revise
after the operation inventory. A session should end with a bounded, tested result.

| Packet | Suggested agent / reasoning | Size | Depends on | Exclusive ownership |
| --- | --- | --- | --- | --- |
| A. Inventory and conventions | Architecture / high | M | None | Feature inventory, geometry conventions, mapping documentation |
| B. Contracts and execution | Core TypeScript / high | L | A | `src/features/core/`, `src/commands/` lifecycle, schema generation |
| C. History and arbitration | State/lifecycle / xhigh | L | B | History transactions, conflict handling, revision integration |
| D. Appearance and settings | React/UI / medium | M | B,C | Appearance/settings feature modules and corresponding UI bindings |
| E. Camera and selection | Viewer integration / high | L | B,C | Camera controller bridge, selection features, navigation bindings |
| F. Transport and session | Browser integration / high | XL | B; E for end-to-end test | `src/agent/`, bridge package, Agent settings/activity UI |
| G. Geometry and alignment | Geometry / xhigh | XL | C,E | Geometry features, alignment adapters, preview/history tests |
| H. Dataset and editing | Data/workflow / high | L | B,C | Dataset/load/conversion/deletion features and workflow bindings |
| I. Inspection and media | UI/media integration / high | L | B,E,F artifact contract | Gallery/image/matches/rig features, capture/record/export/share |
| J. Full parity and rollout | Integration/review / high | L | D–I | Coverage gates, cross-client E2E, documentation and rollout flags |

D and E can run independently after B/C stabilize. F can progress against frozen
contracts alongside D/E. G and H must not concurrently edit reconstruction actions.
I must coordinate capture ownership with E. Assign one writer to shared stores,
schema registries and barrel exports; other agents request integration changes.
Every worker must preserve other contributors' edits. Independent reviews are
bounded read-only packets after B/C, F and G, followed by final integration review.

## A. Exhaustive inventory and coordinate conventions

Expand every family in feature-contracts.md into operation-level entries. Include
each setting, query, initiation, progress, cancel, apply and recovery path. Search
panels, modals, context menus, shortcuts, gestures, exported actions and contextual
buttons. Features absent from the initial family table must be added.

Proposed inventory fields: featureId, operationId, currentHandlers, humanBindings,
input/output schema owner, resource domains, availability, recovery, agentBinding,
tests, migration status and outstanding gaps. Record source paths for evidence.
Do not treat a family-level checkmark as operation coverage.

Freeze conventions for dataset/scene/camera coordinates, handedness, quaternion
order, matrix layout/composition, units and pivots. Derive them from the existing
COLMAP/Sim3 helpers and validate with known-axis fixtures rather than inventing a
second convention. Exit gate: every discovered business action has an inventory
entry; every ambiguous geometry field has a documented interpretation.

## B. Contract and dispatcher details

Use feature IDs such as `appearance.pointColor` and operation IDs such as `set`.
Each operation owns Zod input/result schemas and a shared handler. Generate agent
tool schemas and reference docs; retain human layout components and their bindings.
Queries and events are part of the contract, not an afterthought.

External envelope, illustrative shape:

```ts
type Request = {
  protocolVersion: 1;
  sessionId: string;
  requestId: string;
  feature: string;
  operation: string;
  datasetGeneration?: number;
  expectedRevisions?: Record<string, number>;
  input: unknown; // parsed against the selected operation's strict schema
};
type Status = 'queued' | 'running' | 'waiting_for_user' |
  'succeeded' | 'failed' | 'cancelled';
```

The registry validates the feature/operation pair before parsing input. Actor
identity and granted scopes come from the trusted adapter/session, never from a
caller-supplied `actor: human` field. Internal UI bindings call the same domain
services using a distinct trusted execution context.

Results include requestId, operationId, status, affected revisions, typed output,
and typed error/recovery information. Accepted is not succeeded. For camera/capture,
distinguish applied state, finished animation and rendered frame. Synchronous
handlers complete through the same result model without unnecessary queuing.

Starting bounded policies, configurable centrally and tuned during validation:
64 queued mutations per session, 1,000 deduplicated request results, 500 activity
entries, 100 entities per query by default and 1,000 maximum. No whole-cloud query.
Evict only terminal results; retry behavior beyond the deduplication retention
window must be documented. Same requestId with different input is rejected.

Acquire conflict domains before mutation; validate generation/revisions again
after asynchronous preparation. Do not hold locks while awaiting human approval.
Define an irreversible commit boundary for each operation: cancellation before it
prevents mutation; after it, report actual completion and recovery, never a false
cancelled result. Limit background events to semantic changes/progress, not frames.

Tests: strict parsing, invalid enum/range, duplicate IDs, duplicate relative moves,
stale revision, async failure, cleanup, cancellation races and bounded retention.

## C. History, transactions and user precedence

Introduce a transaction API shared by human and agent actions. Slider/gizmo drags
begin/update/commit one transaction; Escape cancels. Record before/after semantic
state, affected resources, dataset generation and initiator. Human changes update
the same revisions even before every legacy UI binding has migrated.

Use a single serial history timeline initially: undo restores the latest valid
transaction, not arbitrary selective reversal of an agent action beneath newer
human edits. New edits invalidate redo. Dataset replacement creates a barrier.
Cap history by entries and bytes; an oversized operation must declare its barrier
before mutation. Do not retain entire reconstructions for ordinary display edits.

Human camera input interrupts camera animation; human geometry changes invalidate
dependent previews. Stop disconnects the agent lease and prevents future effects,
but does not silently undo finished actions. Bind approvals to proposal hash,
dataset generation, resource revisions and session. Revocation invalidates them.

Tests: interleaved human/agent edits, grouped drag undo, redo invalidation, barriers,
Stop during each operation phase, stale approvals and no unrelated-state rollback.

## D/E. Appearance, settings, camera and selection

Bind explicit appearance setters to the current point-cloud/camera stores and
panels; use existing enums and parameter ranges. Include background, axes/grid,
frustum/selection styling, rig/matches display, UI theme, profiles and customization.
Changing UI theme must not change scene color or enter exported dataset settings.

Camera service: register/unregister the live scene controller on mount/unmount.
Expose getPose, setPose, orbit, stop and completion observation. Validate finite
coordinates, normalized nonzero quaternion, projection constraints and explicit
pivot/frame. A relative orbit resolves against one checked revision and requestId.
Register no success until the live controller has accepted the operation; cancel
animations when controls unmount or a newer human interaction takes precedence.

Selection queries return stable IDs plus dataset generation. Define replace/add/
remove semantics per entity type. Reject unsupported selection types and stale IDs.
Do not fabricate persistent IDs for splat samples where the backend exposes none.
Provide actual capability reasons and alternative coordinate-based operations.

Tests: paired panel/tool setters, persistence parity, camera canonical poses and
orbit composition, animation interruption, select/deselect, backend capability
changes, and no per-frame React rerenders caused by agent status reporting.

## F. Connection, transports and visible control

Transport-neutral adapter contract: discover capabilities, invoke, cancel,
subscribe or poll, and fetch bounded artifacts. WebMCP is a feature-detected
adapter; freeze implementation against verified current official API documentation
when work begins. Unsupported browsers must retain the full human experience.

Existing-tab bridge packaging is a separate deliverable: a local MCP server plus
browser extension or verified CDP connector. During A, select one based on the
target client's ability to attach to the user's real tab. Document installation
and pairing, do not silently open an isolated browser. Test HTTPS hosted ColmapView
and localhost; inspect origin, localhost-access and extension permission behavior.

Handshake: agent requests pairing -> user selects/confirms tab and scopes -> issue
ephemeral lease -> expose allowed capabilities. Scopes cover inspection, reversible
changes, geometry proposals, artifact sharing and destructive operations. Approval
and browser activation remain human-only authority. Navigation/reload invalidates
leases. Multiple agents may inspect if granted; initially allow one active mutator.

Agent UI states: unavailable, disconnected, pairing, connected/idle, acting,
waiting for user, stopped, error. Compact status and Stop are visible while acting;
activity details are expandable. Preserve existing keyboard/touch sizing and
light/dark tokens. Reconnection cannot restore old permissions silently.

Artifact records contain ID, MIME type, dimensions/size, render revision and expiry;
use scoped fetch/release, not raw local paths. A proposed initial artifact budget
is 32 MiB with 5-minute expiry, verified against actual capture needs. Redact URL
secrets and local paths from logs. Bridge calls must not accept arbitrary JS.

Tests: real client discovery/action, tab isolation, expired lease, self-approval
attempt, origin mismatch, disconnect cleanup, unsupported API, artifact expiry,
Stop during running work, keyboard/mobile connection flow and zero idle polling.

## G. Alignment and geometry

Reuse transformActions, transformStore, pointPickingStore, floor detection and
existing Sim3 solvers. Split UI picking from solver input so both interfaces feed
the same validated constraints. Cover one-point origin, two-point scale,
three-point alignment, floor fitting, centering and explicit transform editing.

Preview returns a proposal ID, input IDs/coordinates, matrix/Sim3 transform,
constraint diagnostics, affected resources, source revisions and optional before/
after captures. Degeneracy thresholds derive from dataset scale and existing math
policies. No partial preview when validation fails. One geometry preview owns the
visual transform at a time; replacing one explicitly cancels the former proposal.

Apply commits exactly the reviewed proposal. Verify camera poses, points, splat
transforms and exports remain in consistent coordinates. Undo must restore all
affected state; using inverse Euler components is forbidden. Choose tested inverse
Sim3 or snapshots based on whether the operation changes topology/data representation.

Tests: identity, known translation/rotation/scale, degenerate constraints, non-unit
input frames, splat/COLMAP consistency, repeated Apply deduplication, cancellation,
stale preview and apply/undo/export round trips against existing fixtures.

## H/I. Complete feature-family bindings

| Family | Additional implementation specification | Acceptance evidence |
| --- | --- | --- |
| Load/reload | Use existing parsers/adapters; explicit operation progress and cancellation; dataset-generation transition | Switch dataset during fetch/parse; old work cannot mutate new scene |
| Local files | User-gesture picker returns scoped handles into a waiting operation | Cancel picker, revoke access, reload tab; no arbitrary path access |
| Gallery/image viewer | Typed sort/filter/layout/navigation and overlay settings; image queries paginated | Human/tool parity for navigation, masks, points and matches |
| Matches/rigs | Queries/settings cover available model data; expose availability and bounded results | Missing rig/match data, filtering, selection synchronization |
| Conversion/deletion | Separate candidate query, preview, commit and recovery; use existing coordinated actions | Consistent counts/references, approval, cancellation, valid exports |
| Screenshot | Capture actual composite renderer after requested revision; optional UI inclusion explicit | Three.js/splat composition, dimensions, CORS failure, no unwanted download |
| Recording | Start/stop/cancel state machine with format capability checks and bounded output | Stop/disconnect during recording, encoder failures, browser support |
| Export/share | Generate artifact separately from delivery; sharing explicit and sanitized | Export round trips, pending user gesture, no secret leakage |
| Profiles/settings | Schema validation, explicit overwrite/delete, existing storage migration | Persistence and reset behavior identical via both interfaces |
| Help/diagnostics | Version, capabilities, settings descriptions, bounded diagnostics | Discoverability without loading full datasets or heavy optional tools |
| Browser controls | Fullscreen/pointer lock requests report actual completion or waiting for user | No success on denied activation, Escape exits correctly |

All family members from the coverage inventory remain required even if absent
from this table. Implementation agents must enumerate and close their operation
gaps before marking their packet complete.

## J. Coverage and release gates

Generate a report listing each operation's schema, shared handler, human binding,
agent mapping, availability policy and parity tests. Mark partial migration honestly.
Schema snapshots detect accidental breaking changes; version intentional breaks.
Lint/dependency rules prevent new direct domain mutations in migrated UI modules,
while permitting renderer internals and ephemeral presentation state.

Add an operation registration checklist to PR review because registry tests cannot
detect features that were never registered. Full completion requires no unexplained
legacy or single-interface business operations. Environmental unavailability must
be justified by a real capability constraint, not used to hide unfinished bindings.

End-to-end demonstrations: change colors/orbit/capture; select points/preview/apply/
undo alignment; switch dataset mid-operation; human interruption; export and
recording handoffs. Test at least one real WebMCP-capable agent configuration and
one existing-tab bridge client. Record exact versions and supported environments.

Before release: lint, all unit tests, production build, relevant UI/render/network
E2E, geometry/pycolmap round trips, and baseline/after startup and frame-time checks.
Initial performance acceptance: disconnected agent integration creates no polling
or recurring work; normal rendering remains unchanged; adapter code loads on demand.
Set quantitative latency/bundle budgets from A's measurements before implementation.

Each packet handoff includes changed files, inventory rows completed, tests/results,
known limitations, migration/rollback notes, and next dependent packet. Retain
feature flags around adapters until end-to-end validation. Publish only on request.
