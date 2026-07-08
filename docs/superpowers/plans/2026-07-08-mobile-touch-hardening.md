# Mobile Touch Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining mobile-support gaps: frustum long-press misfires during drags/pinches, crash-reload loops on `?url=` auto-load, silent oversized downloads on phones, mixed desktop/touch layout at phone widths, and notch safe-areas — then ship v0.9.4.

**Architecture:** All interaction fixes reuse the pattern already landed in `useSceneContextMenuController`: window-level move tracking with pointer-id matching, cancellation on multi-touch, and stale-timer identity guards. A module-level scene touch-pointer counter (fed by the already-fixed scene controller, which sees every scene touch via DOM bubbling) lets the per-mesh frustum hooks know about fingers they can't see. Data-safety fixes are pure policy functions in `urlLoaderPolicy.ts` / `appStartupPolicy.ts` with thin wiring, matching the repo's policy-file convention.

**Tech Stack:** React 18 + TypeScript, Zustand, React Three Fiber, Vitest (jsdom), hand-written CSS (`src/index.css`).

## Global Constraints

- **No Tailwind.** `src/index.css` is hand-authored; bracket `[...]` utilities and colon-form `hover:` are silent no-ops. New CSS goes into `src/index.css` as real rules.
- **Store boundary:** components must not call `use*Store` directly — go through a `*StoreFacade`. Hooks (`src/hooks/`, `src/components/**/use*.ts` non-component modules) may import stores directly.
- **TDD:** every behavior change lands with a failing test first. Test files sit beside sources with `.test.ts` suffix, run via `npx vitest run <path>`.
- **Before ANY push:** full `npm run test:run` (deploy CI runs the full suite), `npm run lint`, `npm run build` must pass.
- **Commit style:** conventional commits matching repo history (`fix(viewer): …`, `feat(loader): …`, `Bump version to X`).
- All work happens in `colmap-webview/` (the repo root). Paths below are relative to it.
- Zustand test gotcha: spying on store actions leaks across tests because `set()` copies action refs into new state objects — reset with `useXStore.setState(useXStore.getInitialState(), true)` in `afterEach`.
- Known-good constants already in the tree: `TOUCH.longPressDelay = 500`, `TOUCH.dragThreshold = 10`, `FRUSTUM_TOUCH_TAP_MAX_DISTANCE_SQUARED = 225`, `SPLAT_AUTO_LOAD_MAX_BYTES = 150_000_000`, `SPLAT_AUTO_LOAD_MAX_BYTES_TOUCH = 50_000_000`, `TOUCH_BREAKPOINTS.phone = 640`.

## Explicit Non-Goals (deferred, do not implement)

- Cache API/OPFS persistence of downloaded bins (repeat-visit data usage).
- Reducing in-memory retention of `images.bin` / File blobs (perf project; export flows depend on them).
- Playwright/E2E touch-emulation harness.
- The edge case where a second finger rests on a floating panel *outside* the scene container during a canvas long-press.

---

### Task 1: Commit the already-implemented fixes sitting in the working tree

The working tree already contains two verified fixes (full suite green: 453 files / 2914 tests, lint + build clean). Commit them as two commits so later tasks build on a clean tree.

**Files (commit A — splat auto-load budget):**
- `src/hooks/urlLoaderPolicy.ts`, `src/hooks/urlLoaderPolicy.test.ts`
- `src/hooks/urlLoaderManifestFetch.ts`, `src/hooks/urlLoaderManifestFetch.test.ts`
- `src/hooks/useUrlLoader.ts`, `src/hooks/useUrlLoader.test.ts`
- `src/store/reconstructionStore.ts`, `src/store/reconstructionStore.test.ts`
- `src/components/modals/splatPickerViewModel.ts`, `src/components/modals/splatPickerViewModel.test.ts`
- `src/components/modals/SplatPickerModal.tsx`

**Files (commit B — long-press correctness):**
- `src/components/viewer3d/useSceneContextMenuController.ts`, `src/components/viewer3d/useSceneContextMenuController.test.ts`
- `src/components/viewer3d/Scene3D.tsx`
- `src/hooks/useLongPress.ts`, `src/hooks/useLongPress.test.ts`
- `src/theme/sizing.ts`

- [ ] **Step 1: Verify clean state of everything else**

Run: `git status --porcelain`
Expected: only the files listed above (plus `docs/superpowers/plans/2026-07-08-mobile-touch-hardening.md`).

- [ ] **Step 2: Run the touched suites**

Run: `npx vitest run src/hooks/urlLoaderPolicy.test.ts src/hooks/urlLoaderManifestFetch.test.ts src/store/reconstructionStore.test.ts src/components/modals/splatPickerViewModel.test.ts src/hooks/useUrlLoader.test.ts src/hooks/useLongPress.test.ts src/components/viewer3d/useSceneContextMenuController.test.ts`
Expected: all pass.

- [ ] **Step 3: Commit A**

```bash
git add src/hooks/urlLoaderPolicy.ts src/hooks/urlLoaderPolicy.test.ts src/hooks/urlLoaderManifestFetch.ts src/hooks/urlLoaderManifestFetch.test.ts src/hooks/useUrlLoader.ts src/hooks/useUrlLoader.test.ts src/store/reconstructionStore.ts src/store/reconstructionStore.test.ts src/components/modals/splatPickerViewModel.ts src/components/modals/splatPickerViewModel.test.ts src/components/modals/SplatPickerModal.tsx
git commit -m "fix(loader): size-budget single-splat auto-load; route oversized splats through the picker"
```

- [ ] **Step 4: Commit B**

```bash
git add src/components/viewer3d/useSceneContextMenuController.ts src/components/viewer3d/useSceneContextMenuController.test.ts src/components/viewer3d/Scene3D.tsx src/hooks/useLongPress.ts src/hooks/useLongPress.test.ts src/theme/sizing.ts
git commit -m "fix(viewer): cancel scene long-press on multi-touch; suppress touch-derived native contextmenu"
```

- [ ] **Step 5: Commit the plan file**

```bash
git add docs/superpowers/plans/2026-07-08-mobile-touch-hardening.md
git commit -m "docs: mobile touch hardening plan"
```

---

### Task 2: Scene-wide active-touch-pointer counter

The frustum hooks are per-mesh and cannot see a second finger that lands elsewhere. The scene controller (fixed in Task 1's commit B) tracks every scene touch in `activeTouchPointersRef` — every touch on the canvas or a mesh bubbles to the container div. Publish that count through the existing module-level guard file so mesh-level timers can consult it.

**Files:**
- Modify: `src/components/viewer3d/frustumTouchGuards.ts`
- Modify: `src/components/viewer3d/useSceneContextMenuController.ts`
- Test: `src/components/viewer3d/useSceneContextMenuController.test.ts`

**Interfaces:**
- Produces: `setActiveSceneTouchPointerCount(count: number): void`, `getActiveSceneTouchPointerCount(): number`, `isSingleActiveSceneTouchPointer(): boolean` from `frustumTouchGuards.ts`. Task 3's timer fire-gate consumes `isSingleActiveSceneTouchPointer`.
- `resetFrustumTouchGuards()` also resets the counter to 0.

- [ ] **Step 1: Write the failing test** (append to `useSceneContextMenuController.test.ts`; add `getActiveSceneTouchPointerCount`, `resetFrustumTouchGuards` to imports from `./frustumTouchGuards`, and call `resetFrustumTouchGuards()` in the existing `afterEach`)

```ts
it('publishes the active scene touch-pointer count for mesh-level long-press gates', () => {
  useUIStore.getState().setTouchMode(true, 'url');
  const { result, unmount } = renderHook(() => useSceneContextMenuController());

  expect(getActiveSceneTouchPointerCount()).toBe(0);
  act(() => result.current.handleTouchPointerDown(pointerEvent({ pointerId: 1 })));
  expect(getActiveSceneTouchPointerCount()).toBe(1);
  act(() => result.current.handleTouchPointerDown(pointerEvent({ pointerId: 2, clientX: 120, clientY: 220 })));
  expect(getActiveSceneTouchPointerCount()).toBe(2);
  act(() => result.current.handleTouchPointerUp(pointerEvent({ pointerId: 2, clientX: 120, clientY: 220 })));
  expect(getActiveSceneTouchPointerCount()).toBe(1);
  unmount();
  expect(getActiveSceneTouchPointerCount()).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/viewer3d/useSceneContextMenuController.test.ts`
Expected: FAIL — `getActiveSceneTouchPointerCount` is not exported.

- [ ] **Step 3: Implement**

Append to `frustumTouchGuards.ts`:

```ts
/**
 * Active touch pointers on the scene, maintained by useSceneContextMenuController
 * (the container sees every scene touch via bubbling). Mesh-level long-press
 * timers cannot see fingers on other meshes; they gate on this instead: a
 * long-press may only fire while it is the lone active touch pointer.
 */
let _activeSceneTouchPointers = 0;

export function setActiveSceneTouchPointerCount(count: number) {
  _activeSceneTouchPointers = count;
}

export function getActiveSceneTouchPointerCount(): number {
  return _activeSceneTouchPointers;
}

export function isSingleActiveSceneTouchPointer(): boolean {
  return _activeSceneTouchPointers === 1;
}
```

And add `_activeSceneTouchPointers = 0;` inside `resetFrustumTouchGuards()`.

In `useSceneContextMenuController.ts`, import `setActiveSceneTouchPointerCount` from `./frustumTouchGuards` and publish after every mutation of `activeTouchPointersRef.current`:
- in `handleTouchPointerDown` right after `.add(event.pointerId)`;
- in `handleTouchPointerEnd` right after `.delete(event.pointerId)`;
- in the `useEffect` where `activeTouchPointers.clear()` runs (both the `!touchMode` branch and the cleanup), call `setActiveSceneTouchPointerCount(0)` after `.clear()`.

Each call is `setActiveSceneTouchPointerCount(activeTouchPointersRef.current.size);` (or literal `0` after `clear()`).

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/components/viewer3d/useSceneContextMenuController.test.ts`
Expected: all pass (including the pre-existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/viewer3d/frustumTouchGuards.ts src/components/viewer3d/useSceneContextMenuController.ts src/components/viewer3d/useSceneContextMenuController.test.ts
git commit -m "feat(viewer): publish scene-wide active touch-pointer count for mesh long-press gates"
```

---

### Task 3: `armFrustumLongPress` shared helper

One correct long-press implementation for both frustum hooks. Uses **window-level** pointer listeners while armed (no per-mesh raycast cost, works even when the scene rotates under a stationary finger), cancels on movement past the tap threshold, and at fire time only fires while exactly one scene touch pointer is active (kills pinch misfires and OS-cancelled gestures).

**Files:**
- Create: `src/components/viewer3d/frustumLongPress.ts`
- Test: `src/components/viewer3d/frustumLongPress.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface FrustumLongPressHandle {
    readonly startX: number;
    readonly startY: number;
    readonly fired: boolean;
    cancel(): void;
  }
  function armFrustumLongPress(options: {
    pointerId: number;
    x: number;
    y: number;
    onFire: () => void;
    delayMs?: number;          // default TOUCH.longPressDelay
    maxTravelSquared?: number; // default FRUSTUM_TOUCH_TAP_MAX_DISTANCE_SQUARED
  }): FrustumLongPressHandle
  ```
- Consumes: `isSingleActiveSceneTouchPointer()` (Task 2), `getSquaredTouchTravel` + `FRUSTUM_TOUCH_TAP_MAX_DISTANCE_SQUARED` from `frustumPlaneTouchPolicy.ts`, `TOUCH.longPressDelay` from `theme/sizing`.

- [ ] **Step 1: Write the failing tests**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { armFrustumLongPress } from './frustumLongPress';
import { resetFrustumTouchGuards, setActiveSceneTouchPointerCount } from './frustumTouchGuards';
import { TOUCH } from '../../theme/sizing';

function dispatchWindowPointer(type: 'pointermove' | 'pointerup' | 'pointercancel', pointerId: number, clientX = 0, clientY = 0) {
  const event = new Event(type);
  Object.assign(event, { pointerId, clientX, clientY });
  window.dispatchEvent(event);
}

afterEach(() => {
  vi.useRealTimers();
  resetFrustumTouchGuards();
});

describe('armFrustumLongPress', () => {
  it('fires after the delay while the lone touch pointer holds still', () => {
    vi.useFakeTimers();
    setActiveSceneTouchPointerCount(1);
    const onFire = vi.fn();
    const handle = armFrustumLongPress({ pointerId: 1, x: 10, y: 20, onFire });

    vi.advanceTimersByTime(TOUCH.longPressDelay);

    expect(onFire).toHaveBeenCalledTimes(1);
    expect(handle.fired).toBe(true);
  });

  it('cancels when the armed pointer moves past the tap threshold', () => {
    vi.useFakeTimers();
    setActiveSceneTouchPointerCount(1);
    const onFire = vi.fn();
    const handle = armFrustumLongPress({ pointerId: 1, x: 10, y: 20, onFire });

    dispatchWindowPointer('pointermove', 1, 40, 20); // 30px > 15px tap radius
    vi.advanceTimersByTime(TOUCH.longPressDelay);

    expect(onFire).not.toHaveBeenCalled();
    expect(handle.fired).toBe(false);
  });

  it('ignores moves from other pointers', () => {
    vi.useFakeTimers();
    setActiveSceneTouchPointerCount(1);
    const onFire = vi.fn();
    armFrustumLongPress({ pointerId: 1, x: 10, y: 20, onFire });

    dispatchWindowPointer('pointermove', 2, 500, 500);
    vi.advanceTimersByTime(TOUCH.longPressDelay);

    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('does not fire when a second scene touch pointer is active at fire time (pinch)', () => {
    vi.useFakeTimers();
    setActiveSceneTouchPointerCount(1);
    const onFire = vi.fn();
    armFrustumLongPress({ pointerId: 1, x: 10, y: 20, onFire });

    setActiveSceneTouchPointerCount(2); // second finger landed anywhere in the scene
    vi.advanceTimersByTime(TOUCH.longPressDelay);

    expect(onFire).not.toHaveBeenCalled();
  });

  it('cancels on window pointerup / pointercancel of the armed pointer', () => {
    vi.useFakeTimers();
    setActiveSceneTouchPointerCount(1);
    const onFire = vi.fn();
    armFrustumLongPress({ pointerId: 1, x: 10, y: 20, onFire });
    dispatchWindowPointer('pointercancel', 1);
    vi.advanceTimersByTime(TOUCH.longPressDelay);
    expect(onFire).not.toHaveBeenCalled();
  });

  it('cancel() is idempotent and removes window listeners', () => {
    vi.useFakeTimers();
    setActiveSceneTouchPointerCount(1);
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const handle = armFrustumLongPress({ pointerId: 1, x: 10, y: 20, onFire: vi.fn() });
    handle.cancel();
    handle.cancel();
    expect(removeSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('pointercancel', expect.any(Function));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/viewer3d/frustumLongPress.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `frustumLongPress.ts`**

```ts
import { TOUCH } from '../../theme/sizing';
import {
  FRUSTUM_TOUCH_TAP_MAX_DISTANCE_SQUARED,
  getSquaredTouchTravel,
} from './frustumPlaneTouchPolicy';
import { isSingleActiveSceneTouchPointer } from './frustumTouchGuards';

export interface FrustumLongPressHandle {
  readonly startX: number;
  readonly startY: number;
  readonly fired: boolean;
  cancel(): void;
}

/**
 * Long-press tracker for frustum hit targets. Listens on window (per-mesh
 * pointermove is unreliable during orbit and costs a raycast per move):
 * - moves of the armed pointer beyond the tap radius cancel the press;
 * - window pointerup/pointercancel of the armed pointer cancels it;
 * - at fire time the press only fires while it is the scene's lone active
 *   touch pointer (see frustumTouchGuards), so pinches and OS-cancelled
 *   gestures can never pop a menu or modal.
 */
export function armFrustumLongPress({
  pointerId,
  x,
  y,
  onFire,
  delayMs = TOUCH.longPressDelay,
  maxTravelSquared = FRUSTUM_TOUCH_TAP_MAX_DISTANCE_SQUARED,
}: {
  pointerId: number;
  x: number;
  y: number;
  onFire: () => void;
  delayMs?: number;
  maxTravelSquared?: number;
}): FrustumLongPressHandle {
  let fired = false;
  let cancelled = false;

  const onWindowPointerMove = (event: Event) => {
    const pointer = event as PointerEvent;
    if (pointer.pointerId !== pointerId) return;
    const travel = getSquaredTouchTravel({ x, y }, { x: pointer.clientX, y: pointer.clientY });
    if (travel > maxTravelSquared) cancel();
  };
  const onWindowPointerEnd = (event: Event) => {
    if ((event as PointerEvent).pointerId !== pointerId) return;
    cancel();
  };

  const detach = () => {
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerEnd);
    window.removeEventListener('pointercancel', onWindowPointerEnd);
  };

  const timer = setTimeout(() => {
    detach();
    if (cancelled || !isSingleActiveSceneTouchPointer()) return;
    fired = true;
    onFire();
  }, delayMs);

  function cancel() {
    if (cancelled) return;
    cancelled = true;
    clearTimeout(timer);
    detach();
  }

  window.addEventListener('pointermove', onWindowPointerMove);
  window.addEventListener('pointerup', onWindowPointerEnd);
  window.addEventListener('pointercancel', onWindowPointerEnd);

  return {
    startX: x,
    startY: y,
    get fired() {
      return fired;
    },
    cancel,
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/components/viewer3d/frustumLongPress.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/viewer3d/frustumLongPress.ts src/components/viewer3d/frustumLongPress.test.ts
git commit -m "feat(viewer): shared frustum long-press tracker with move/multi-touch cancellation"
```

---

### Task 4: Rewire `useFrustumPlaneTouchInteractions` onto the tracker

Today this hook (per-plane frustums) arms a bare `setTimeout` on ANY pointerdown with no movement cancellation — orbiting from a frustum for ≥500ms opens the image-detail modal mid-drag, and a second finger orphans the first timer. Replace the timer with `armFrustumLongPress`, arm only for touch pointers, and keep mouse taps (in touch mode) working by recording the start position without a timer.

**Files:**
- Modify: `src/components/viewer3d/useFrustumPlaneTouchInteractions.ts`
- Test: `src/components/viewer3d/useFrustumPlaneTouchInteractions.test.ts` (extend; if the file does not exist, create it with the content below)

**Interfaces:**
- Consumes: `armFrustumLongPress`, `FrustumLongPressHandle` (Task 3); `markSceneObjectTouchDownForTouchPointer`, `setActiveSceneTouchPointerCount` (guards); existing `getFrustumPlaneTouchUpAction`.
- Produces: unchanged hook signature — `{ onPointerDown, onPointerUp }` (both `ThreeEvent<PointerEvent>` handlers, undefined when `enabled` is false).

- [ ] **Step 1: Write the failing tests**

```ts
import { renderHook } from '@testing-library/react';
import type { ThreeEvent } from '@react-three/fiber';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOUCH } from '../../theme/sizing';
import { resetFrustumTouchGuards, setActiveSceneTouchPointerCount } from './frustumTouchGuards';
import { useFrustumPlaneTouchInteractions } from './useFrustumPlaneTouchInteractions';

function planePointerEvent(overrides: Partial<{ pointerId: number; pointerType: string; clientX: number; clientY: number }> = {}) {
  const nativeEvent = { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 20, ...overrides };
  return { nativeEvent, stopPropagation: vi.fn() } as unknown as ThreeEvent<PointerEvent>;
}

function dispatchWindowPointerMove(pointerId: number, clientX: number, clientY: number) {
  const event = new Event('pointermove');
  Object.assign(event, { pointerId, clientX, clientY });
  window.dispatchEvent(event);
}

afterEach(() => {
  vi.useRealTimers();
  resetFrustumTouchGuards();
});

describe('useFrustumPlaneTouchInteractions long-press', () => {
  function renderInteractions(overrides: { isSelected?: boolean } = {}) {
    const onContextMenu = vi.fn();
    const onLongPress = vi.fn();
    const setTouchTransparent = vi.fn();
    const { result } = renderHook(() =>
      useFrustumPlaneTouchInteractions({
        enabled: true,
        imageId: 7,
        isSelected: overrides.isSelected ?? false,
        onContextMenu,
        onLongPress,
        setTouchTransparent,
      })
    );
    return { result, onContextMenu, onLongPress, setTouchTransparent };
  }

  it('fires the long-press for a stationary lone touch', () => {
    vi.useFakeTimers();
    const { result, onLongPress } = renderInteractions();

    result.current.onPointerDown!(planePointerEvent());
    setActiveSceneTouchPointerCount(1);
    vi.advanceTimersByTime(TOUCH.longPressDelay);

    expect(onLongPress).toHaveBeenCalledWith(7);
  });

  it('does not fire while dragging (finger moved past the tap radius)', () => {
    vi.useFakeTimers();
    const { result, onLongPress } = renderInteractions();

    result.current.onPointerDown!(planePointerEvent());
    setActiveSceneTouchPointerCount(1);
    dispatchWindowPointerMove(1, 60, 20);
    vi.advanceTimersByTime(TOUCH.longPressDelay);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('does not fire during a pinch (second scene touch pointer active)', () => {
    vi.useFakeTimers();
    const { result, onLongPress } = renderInteractions();

    result.current.onPointerDown!(planePointerEvent());
    setActiveSceneTouchPointerCount(2);
    vi.advanceTimersByTime(TOUCH.longPressDelay);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('never arms a long-press for mouse pointers, but keeps mouse tap actions', () => {
    vi.useFakeTimers();
    const { result, onLongPress, onContextMenu } = renderInteractions();

    result.current.onPointerDown!(planePointerEvent({ pointerType: 'mouse' }));
    vi.advanceTimersByTime(TOUCH.longPressDelay);
    expect(onLongPress).not.toHaveBeenCalled();

    result.current.onPointerUp!(planePointerEvent({ pointerType: 'mouse' }));
    expect(onContextMenu).toHaveBeenCalledWith(7);
  });

  it('suppresses the tap action after a fired long-press', () => {
    vi.useFakeTimers();
    const { result, onContextMenu, onLongPress } = renderInteractions();

    result.current.onPointerDown!(planePointerEvent());
    setActiveSceneTouchPointerCount(1);
    vi.advanceTimersByTime(TOUCH.longPressDelay);
    expect(onLongPress).toHaveBeenCalledTimes(1);

    result.current.onPointerUp!(planePointerEvent());
    expect(onContextMenu).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/viewer3d/useFrustumPlaneTouchInteractions.test.ts`
Expected: FAIL — drag and pinch tests fire `onLongPress` with the current implementation. (If an existing test in this file pins the old always-arm behavior, update that test to the new behavior in this step and say so in the commit.)

- [ ] **Step 3: Implement**

Replace the body of `useFrustumPlaneTouchInteractions.ts` internals (keep the exported options interface):

```ts
import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { armFrustumLongPress, type FrustumLongPressHandle } from './frustumLongPress';
import { markFrustumTap, markSceneObjectTouchDownForTouchPointer } from './frustumTouchGuards';
import { getFrustumPlaneTouchUpAction } from './frustumPlaneTouchPolicy';

interface FrustumPlaneTouchDown {
  x: number;
  y: number;
  /** Armed only for touch pointers; mouse taps record position without a timer. */
  longPress: FrustumLongPressHandle | null;
}
```

Hook body:

```ts
  const touchDownRef = useRef<FrustumPlaneTouchDown | null>(null);

  useEffect(() => {
    return () => {
      touchDownRef.current?.longPress?.cancel();
    };
  }, []);

  const onPointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    touchDownRef.current?.longPress?.cancel();

    const { pointerId, pointerType, clientX, clientY } = e.nativeEvent;
    const isTouch = markSceneObjectTouchDownForTouchPointer(pointerType);

    touchDownRef.current = {
      x: clientX,
      y: clientY,
      longPress: isTouch
        ? armFrustumLongPress({
            pointerId,
            x: clientX,
            y: clientY,
            onFire: () => onLongPress?.(imageId),
          })
        : null,
    };
  }, [imageId, onLongPress]);

  const onPointerUp = useCallback((e: ThreeEvent<PointerEvent>) => {
    const touchDown = touchDownRef.current;
    touchDownRef.current = null;
    const fired = touchDown?.longPress?.fired ?? false;
    touchDown?.longPress?.cancel();

    const action = getFrustumPlaneTouchUpAction({
      touchStart: touchDown ? { x: touchDown.x, y: touchDown.y, fired } : null,
      touchEnd: { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY },
      isSelected,
    });

    if (action === 'none') return;

    e.stopPropagation();
    if (action === 'toggleSelectedTransparency') {
      setTouchTransparent(prev => !prev);
      return;
    }

    markFrustumTap();
    onContextMenu(imageId);
  }, [imageId, isSelected, onContextMenu, setTouchTransparent]);
```

Return block unchanged. Note the deleted `TimedFrustumPlaneTouchStart` interface and the removed `markFrustumTouchDown` import.

- [ ] **Step 4: Run tests + neighbors**

Run: `npx vitest run src/components/viewer3d/useFrustumPlaneTouchInteractions.test.ts src/components/viewer3d/frustumPlaneTouchPolicy.test.ts src/components/viewer3d/useFrustumPlaneClickInteractions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/viewer3d/useFrustumPlaneTouchInteractions.ts src/components/viewer3d/useFrustumPlaneTouchInteractions.test.ts
git commit -m "fix(viewer): frustum-plane long-press cancels on drag, pinch, and mouse pointers"
```

---

### Task 5: Rewire `useBatchedFrustumInteractions` onto the tracker

Same defect in the batched hit-target path (`onPointerDownForTouch`, `useBatchedFrustumInteractions.ts:126-141`).

**Files:**
- Modify: `src/components/viewer3d/useBatchedFrustumInteractions.ts`
- Test: `src/components/viewer3d/useBatchedFrustumInteractions.test.ts` (extend)

**Interfaces:**
- Consumes: `armFrustumLongPress`, `FrustumLongPressHandle` (Task 3); `markSceneObjectTouchDownForTouchPointer` (guards).
- Produces: unchanged hook return; `BatchedFrustumPointerNativeEvent` gains `pointerId?: number; pointerType?: string;`.
- Internal ref shape becomes `{ instanceId: number; x: number; y: number; longPress: FrustumLongPressHandle | null }`; the up handler builds the policy's `BatchedFrustumTouchStart` as `{ instanceId, x, y, fired: longPress?.fired ?? false }`.

- [ ] **Step 1: Write the failing tests** (append to the existing test file, reusing its established render helpers for the hook — the file already renders the hook with a `frustums` fixture; add a `describe('batched long-press')` block with the same five scenarios as Task 4 Step 1, adapted to the batched event shape:)

```ts
function batchedTouchEvent(instanceId: number, overrides: Partial<{ pointerId: number; pointerType: string; clientX: number; clientY: number }> = {}) {
  return {
    instanceId,
    nativeEvent: { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 20, ...overrides },
    stopPropagation: vi.fn(),
  };
}
```

Scenarios (assert against the hook's `onLongPress` / `onContextMenu` spies):
1. stationary lone touch on instance 0 fires `onLongPress` with that frustum's `imageId` after `TOUCH.longPressDelay`;
2. window pointermove of the armed pointer past 15px prevents firing;
3. `setActiveSceneTouchPointerCount(2)` before the delay prevents firing;
4. `pointerType: 'mouse'` never arms (advance timers, no `onLongPress`) but pointer-up still yields the tap context-menu action;
5. after a fired long-press, pointer-up performs no context-menu action.

Include the same `dispatchWindowPointerMove` helper and `afterEach` guard reset as Task 4.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/viewer3d/useBatchedFrustumInteractions.test.ts`
Expected: new tests FAIL (drag/pinch scenarios fire; mouse arms a timer today). Existing tests that pin the old timer behavior, if any, are updated in this step.

- [ ] **Step 3: Implement**

In `useBatchedFrustumInteractions.ts`:

```ts
interface BatchedFrustumPointerNativeEvent {
  button?: number;
  pointerId?: number;
  pointerType?: string;
  clientX: number;
  clientY: number;
}
```

Replace the touch-down ref and handlers:

```ts
  const touchDownRef = useRef<{ instanceId: number; x: number; y: number; longPress: FrustumLongPressHandle | null } | null>(null);

  useEffect(() => {
    return () => {
      clearBodyCursor(CAMERA_FRUSTUM_CURSOR_OWNER);
      touchDownRef.current?.longPress?.cancel();
    };
  }, []);

  const onPointerDownForTouch = useCallback((e: BatchedFrustumEvent<BatchedFrustumPointerNativeEvent>) => {
    if (e.instanceId === undefined) return;

    touchDownRef.current?.longPress?.cancel();

    const instanceId = e.instanceId;
    const { pointerId, pointerType, clientX, clientY } = e.nativeEvent;
    const isTouch = markSceneObjectTouchDownForTouchPointer(pointerType);

    touchDownRef.current = {
      instanceId,
      x: clientX,
      y: clientY,
      longPress: isTouch && pointerId !== undefined
        ? armFrustumLongPress({
            pointerId,
            x: clientX,
            y: clientY,
            onFire: () => {
              const frustum = getFrustum(instanceId);
              if (frustum) onLongPress(frustum.image.imageId);
            },
          })
        : null,
    };
  }, [getFrustum, onLongPress]);

  const onPointerUp = useCallback((e: BatchedFrustumEvent<BatchedFrustumPointerNativeEvent>) => {
    const down = touchDownRef.current;
    touchDownRef.current = null;
    if (!down) return;

    const fired = down.longPress?.fired ?? false;
    down.longPress?.cancel();
    if (fired) return;

    const action = getBatchedFrustumTouchUpAction({
      frustums,
      touchStart: { instanceId: down.instanceId, x: down.x, y: down.y, fired },
      touchEnd: { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY },
      selectedImageId,
    });
    if (action.type !== 'openContextMenu') return;

    e.stopPropagation();
    markFrustumTap();
    onContextMenuAction(action.frustum.image.imageId);
  }, [frustums, onContextMenuAction, selectedImageId]);
```

Imports: add `armFrustumLongPress, type FrustumLongPressHandle` from `./frustumLongPress`; replace `markFrustumTouchDown` with `markSceneObjectTouchDownForTouchPointer` in the `./frustumTouchGuards` import. Drop the old `BatchedFrustumTouchStart & { timer }` ref type (keep the policy's `BatchedFrustumTouchStart` import for the up-action call).

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/components/viewer3d/useBatchedFrustumInteractions.test.ts src/components/viewer3d/batchedFrustumInteractionPolicy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/viewer3d/useBatchedFrustumInteractions.ts src/components/viewer3d/useBatchedFrustumInteractions.test.ts
git commit -m "fix(viewer): batched frustum long-press cancels on drag, pinch, and mouse pointers"
```

---

### Task 6: Crash-loop circuit breaker for `?url=` auto-load

If a `?url=` load OOM-crashes the tab, mobile browsers auto-reload the page and the auto-load re-runs unconditionally — an infinite crash loop for any too-big dataset. Record the attempt in `sessionStorage` before auto-loading; if a previous attempt for the same URL never finished, ask before retrying.

**Files:**
- Create: `src/utils/urlLoadAttemptGuard.ts`
- Test: `src/utils/urlLoadAttemptGuard.test.ts`
- Modify: `src/appStartupPolicy.ts` (+ its existing test file `src/appStartupPolicy.test.ts` if present, else assertions live in the new util test)
- Modify: `src/App.tsx`

**Interfaces:**
- Produces (from `urlLoadAttemptGuard.ts`):
  ```ts
  interface UrlLoadAttemptRecord { url: string }
  function readUnfinishedUrlLoadAttempt(storage?: Pick<Storage, 'getItem'>): UrlLoadAttemptRecord | null
  function markUrlLoadAttemptStarted(url: string, storage?: Pick<Storage, 'setItem'>): void
  function clearUrlLoadAttempt(storage?: Pick<Storage, 'removeItem'>): void
  function shouldConfirmUrlAutoLoad(previous: UrlLoadAttemptRecord | null, manifestUrl: string): boolean
  ```
  Storage defaults to `window.sessionStorage`; every accessor is try/catch-safe (privacy mode) and returns null / no-ops on error.
- Consumes in `App.tsx`: `requestConfirmation` from `src/utils/confirmation.ts` (`{title, message, confirmLabel?, cancelLabel?, size?} => Promise<boolean>`; ConfirmationHost registers its handler on mount, before App's effect runs).

- [ ] **Step 1: Write the failing tests** (`src/utils/urlLoadAttemptGuard.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import {
  clearUrlLoadAttempt,
  markUrlLoadAttemptStarted,
  readUnfinishedUrlLoadAttempt,
  shouldConfirmUrlAutoLoad,
} from './urlLoadAttemptGuard';

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

describe('urlLoadAttemptGuard', () => {
  it('round-trips an attempt record through storage', () => {
    const storage = fakeStorage();
    markUrlLoadAttemptStarted('https://x/dataset', storage);
    expect(readUnfinishedUrlLoadAttempt(storage)).toEqual({ url: 'https://x/dataset' });
    clearUrlLoadAttempt(storage);
    expect(readUnfinishedUrlLoadAttempt(storage)).toBeNull();
  });

  it('returns null for corrupt or missing records', () => {
    expect(readUnfinishedUrlLoadAttempt(fakeStorage())).toBeNull();
    expect(readUnfinishedUrlLoadAttempt(fakeStorage({ 'colmapview.urlLoadAttempt.v1': '{not json' }))).toBeNull();
  });

  it('is safe when storage throws (privacy mode)', () => {
    const throwing = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    };
    expect(readUnfinishedUrlLoadAttempt(throwing)).toBeNull();
    expect(() => markUrlLoadAttemptStarted('https://x', throwing)).not.toThrow();
    expect(() => clearUrlLoadAttempt(throwing)).not.toThrow();
  });

  it('only asks for confirmation when the unfinished attempt matches the URL', () => {
    expect(shouldConfirmUrlAutoLoad({ url: 'https://x/dataset' }, 'https://x/dataset')).toBe(true);
    expect(shouldConfirmUrlAutoLoad({ url: 'https://x/other' }, 'https://x/dataset')).toBe(false);
    expect(shouldConfirmUrlAutoLoad(null, 'https://x/dataset')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/urlLoadAttemptGuard.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `urlLoadAttemptGuard.ts`**

```ts
const URL_LOAD_ATTEMPT_STORAGE_KEY = 'colmapview.urlLoadAttempt.v1';

export interface UrlLoadAttemptRecord {
  url: string;
}

function defaultStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Crash-loop breaker for URL auto-loads. The record is written before an
 * auto-load starts and cleared when the load settles (success OR handled
 * failure). Only a hard tab crash - e.g. mobile OOM followed by the browser's
 * automatic reload - leaves it behind, so its presence at startup means "the
 * last attempt to load this URL killed the tab": ask before trying again.
 */
export function readUnfinishedUrlLoadAttempt(
  storage: Pick<Storage, 'getItem'> | null = defaultStorage()
): UrlLoadAttemptRecord | null {
  try {
    const raw = storage?.getItem(URL_LOAD_ATTEMPT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof (parsed as { url?: unknown }).url === 'string') {
      return { url: (parsed as { url: string }).url };
    }
    return null;
  } catch {
    return null;
  }
}

export function markUrlLoadAttemptStarted(
  url: string,
  storage: Pick<Storage, 'setItem'> | null = defaultStorage()
): void {
  try {
    storage?.setItem(URL_LOAD_ATTEMPT_STORAGE_KEY, JSON.stringify({ url }));
  } catch {
    // Storage unavailable: lose the breaker, never the load.
  }
}

export function clearUrlLoadAttempt(
  storage: Pick<Storage, 'removeItem'> | null = defaultStorage()
): void {
  try {
    storage?.removeItem(URL_LOAD_ATTEMPT_STORAGE_KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}

export function shouldConfirmUrlAutoLoad(
  previous: UrlLoadAttemptRecord | null,
  manifestUrl: string
): boolean {
  return previous !== null && previous.url === manifestUrl;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/utils/urlLoadAttemptGuard.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into `App.tsx`**

In `checkUrlAndLoad` (App.tsx), for both remote-URL plans (`manifest-url` and `legacy-url`), wrap the load:

```ts
      const runGuardedUrlLoad = async (manifestUrl: string): Promise<boolean> => {
        const previousAttempt = readUnfinishedUrlLoadAttempt();
        if (shouldConfirmUrlAutoLoad(previousAttempt, manifestUrl)) {
          const retry = await requestConfirmation({
            title: 'Reload this dataset?',
            message: 'The previous attempt to load this dataset did not finish - it may have run out of memory on this device. Load it again?',
            confirmLabel: 'Load again',
            cancelLabel: 'Not now',
            size: 'compact',
          });
          if (!retry) {
            clearUrlLoadAttempt();
            return false;
          }
        }
        markUrlLoadAttemptStarted(manifestUrl);
        const loaded = await loadFromUrl(manifestUrl);
        clearUrlLoadAttempt();
        return loaded;
      };
```

- `manifest-url` branch: replace `const loaded = await loadFromUrl(loadPlan.manifestUrl);` with `const loaded = await runGuardedUrlLoad(loadPlan.manifestUrl);`
- `legacy-url` branch: replace the fire-and-forget `loadFromUrl(loadPlan.manifestUrl);` with `await runGuardedUrlLoad(loadPlan.manifestUrl);`

Imports in App.tsx: `requestConfirmation` from `./utils/confirmation`; `clearUrlLoadAttempt, markUrlLoadAttemptStarted, readUnfinishedUrlLoadAttempt, shouldConfirmUrlAutoLoad` from `./utils/urlLoadAttemptGuard`.

- [ ] **Step 6: Verify build and neighbors**

Run: `npx vitest run src/utils/urlLoadAttemptGuard.test.ts src/hooks/useUrlLoader.test.ts && npx tsc -b --force`
Expected: PASS / no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/utils/urlLoadAttemptGuard.ts src/utils/urlLoadAttemptGuard.test.ts src/App.tsx
git commit -m "feat(loader): crash-loop breaker - confirm before re-running a url auto-load that never finished"
```

---

### Task 7: Large-dataset warning on touch devices

The HF tree discovery already knows every COLMAP bin's size before anything downloads. On touch devices, when the combined cameras+images+points3D size exceeds 150 MB, surface a warning notification (non-blocking — the circuit breaker from Task 6 already prevents loops if it crashes anyway).

**Files:**
- Modify: `src/hooks/urlLoaderPolicy.ts`
- Test: `src/hooks/urlLoaderPolicy.test.ts`
- Modify: `src/hooks/urlLoaderManifestFetch.ts` (`discoverHuggingFaceLayout`, `withDiscoveredColmapPaths`)
- Test: `src/hooks/urlLoaderManifestFetch.test.ts`
- Modify: `src/hooks/useUrlLoader.ts` (pass the warning callback)

**Interfaces:**
- Produces in `urlLoaderPolicy.ts`:
  ```ts
  const LARGE_COLMAP_TOUCH_WARNING_BYTES = 150_000_000;
  function getHuggingFaceColmapTotalBytes(
    entries: readonly HuggingFaceDatasetTreeEntry[],
    treePath: string,
    colmap: HuggingFaceColmapPaths
  ): number | null   // sum of the cameras/images/points3D entries' sizes; null if any is unknown
  function getLargeColmapDatasetWarning(totalBytes: number | null, isTouchDevice: boolean): string | null
  // message: `Large dataset (${Math.round(totalBytes / 1_000_000)} MB of COLMAP data) - may exceed this device's memory`
  ```
- `withDiscoveredColmapPaths(manifest, deps)` deps gain `isTouchDevice?: boolean` and `onLargeDatasetWarning?: (message: string) => void`; it invokes the callback when `getLargeColmapDatasetWarning(totalBytes, isTouchDevice ?? detectTouchDevice())` is non-null.
- `useUrlLoader.loadFromUrl` passes `onLargeDatasetWarning: (message) => useNotificationStore.getState().addNotification('warning', message, 8000)` — import `useNotificationStore` from `../store/stores/notificationStore` (signature: `addNotification(type, message, duration?) => string`).

- [ ] **Step 1: Write the failing policy tests** (append to `urlLoaderPolicy.test.ts`)

```ts
describe('large COLMAP dataset warning', () => {
  const treePath = 'objects/scan';
  const entries = [
    { type: 'file', path: 'objects/scan/sparse/0/cameras.bin', size: 48 },
    { type: 'file', path: 'objects/scan/sparse/0/images.bin', size: 192_776_427 },
    { type: 'file', path: 'objects/scan/sparse/0/points3D.bin', size: 59_779_977 },
  ];
  const colmap = {
    cameras: 'sparse/0/cameras.bin',
    images: 'sparse/0/images.bin',
    points3D: 'sparse/0/points3D.bin',
  };

  it('sums the discovered COLMAP bin sizes', () => {
    expect(getHuggingFaceColmapTotalBytes(entries, treePath, colmap)).toBe(252_556_452);
  });

  it('returns null when a size is unknown', () => {
    expect(getHuggingFaceColmapTotalBytes(entries.slice(0, 2), treePath, colmap)).toBeNull();
  });

  it('warns on touch devices above the threshold, stays quiet otherwise', () => {
    expect(getLargeColmapDatasetWarning(252_556_452, true)).toBe(
      "Large dataset (253 MB of COLMAP data) - may exceed this device's memory"
    );
    expect(getLargeColmapDatasetWarning(252_556_452, false)).toBeNull();
    expect(getLargeColmapDatasetWarning(100_000_000, true)).toBeNull();
    expect(getLargeColmapDatasetWarning(null, true)).toBeNull();
  });
});
```

(Add `getHuggingFaceColmapTotalBytes`, `getLargeColmapDatasetWarning` to the test file's import list. The exact `HuggingFaceColmapPaths` shape includes optional `rigs`/`frames`; the sum covers only the three required files.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/hooks/urlLoaderPolicy.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement the policy functions** in `urlLoaderPolicy.ts` (beside `getHuggingFaceColmapPaths`):

```ts
export const LARGE_COLMAP_TOUCH_WARNING_BYTES = 150_000_000;

export function getHuggingFaceColmapTotalBytes(
  entries: readonly HuggingFaceDatasetTreeEntry[],
  treePath: string,
  colmap: Pick<HuggingFaceColmapPaths, 'cameras' | 'images' | 'points3D'>
): number | null {
  const sizeByRelativePath = new Map<string, number>();
  for (const entry of entries) {
    if (entry.type !== 'file' || typeof entry.path !== 'string' || typeof entry.size !== 'number') continue;
    const relativePath = getRelativeHuggingFaceTreePath(entry.path, treePath);
    if (relativePath) sizeByRelativePath.set(relativePath, entry.size);
  }

  let total = 0;
  for (const path of [colmap.cameras, colmap.images, colmap.points3D]) {
    const size = sizeByRelativePath.get(path);
    if (size === undefined) return null;
    total += size;
  }
  return total;
}

/** Non-blocking heads-up before a phone downloads a quarter-gigabyte of bins. */
export function getLargeColmapDatasetWarning(
  totalBytes: number | null,
  isTouchDevice: boolean
): string | null {
  if (!isTouchDevice || totalBytes === null || totalBytes <= LARGE_COLMAP_TOUCH_WARNING_BYTES) {
    return null;
  }
  return `Large dataset (${Math.round(totalBytes / 1_000_000)} MB of COLMAP data) - may exceed this device's memory`;
}
```

Run: `npx vitest run src/hooks/urlLoaderPolicy.test.ts` — PASS.

- [ ] **Step 4: Write the failing wiring test** (append to `urlLoaderManifestFetch.test.ts`; model the fetch stub on the existing `discovers ... Hugging Face` tests — tree JSON with the three bins above plus a huge images.bin)

```ts
  it('reports a large-dataset warning for touch devices during layout discovery', async () => {
    const onLargeDatasetWarning = vi.fn();
    const fetchImpl = vi.fn(async () => jsonResponse([
      { type: 'file', path: 'sparse/0/cameras.bin', size: 48 },
      { type: 'file', path: 'sparse/0/images.bin', size: 192_776_427 },
      { type: 'file', path: 'sparse/0/points3D.bin', size: 59_779_977 },
    ]));

    await withDiscoveredColmapPaths(
      createDefaultManifest('https://huggingface.co/datasets/Acme/Scene/resolve/main'),
      { fetchImpl, isTouchDevice: true, onLargeDatasetWarning }
    );

    expect(onLargeDatasetWarning).toHaveBeenCalledWith(
      "Large dataset (253 MB of COLMAP data) - may exceed this device's memory"
    );
  });
```

(`withDiscoveredColmapPaths` and `createDefaultManifest` need adding to this test file's imports — `createDefaultManifest` comes from `./urlLoaderPolicy`.)

- [ ] **Step 5: Implement the wiring**

In `urlLoaderManifestFetch.ts`:
- `discoverHuggingFaceLayout` computes `const colmapTotalBytes = colmap ? getHuggingFaceColmapTotalBytes(entries, request.treePath, colmap) : null;` and includes `colmapTotalBytes` in the returned `HuggingFaceLayout` (add `colmapTotalBytes: number | null;` to the interface).
- `withDiscoveredColmapPaths(manifest, deps)`: widen deps to `Pick<FetchManifestColmapFilesDeps, 'fetchImpl' | 'log' | 'isTouchDevice'> & { onLargeDatasetWarning?: (message: string) => void }`. After a successful layout discovery:

```ts
    const warning = getLargeColmapDatasetWarning(
      layout.colmapTotalBytes,
      deps.isTouchDevice ?? detectTouchDevice()
    );
    if (warning) {
      deps.log?.(`[URL Loader] ${warning}`);
      deps.onLargeDatasetWarning?.(warning);
    }
```

- Add `getHuggingFaceColmapTotalBytes, getLargeColmapDatasetWarning` to the `./urlLoaderPolicy` import.

In `useUrlLoader.ts`, the `withDiscoveredColmapPaths` call becomes:

```ts
        manifest = await withDiscoveredColmapPaths(manifest, {
          log: logInfo,
          onLargeDatasetWarning: (message) =>
            useNotificationStore.getState().addNotification('warning', message, 8000),
        });
```

with `import { useNotificationStore } from '../store/stores/notificationStore';`.

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/hooks/urlLoaderManifestFetch.test.ts src/hooks/urlLoaderPolicy.test.ts src/hooks/useUrlLoader.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/urlLoaderPolicy.ts src/hooks/urlLoaderPolicy.test.ts src/hooks/urlLoaderManifestFetch.ts src/hooks/urlLoaderManifestFetch.test.ts src/hooks/useUrlLoader.ts
git commit -m "feat(loader): warn touch devices before downloading oversized COLMAP bins"
```

---

### Task 8: Device-memory hint in the splat picker

The picker shows "1.0 GB" but nothing tells a phone user that tapping it will likely kill the tab. Add a per-row warning when a splat exceeds the device's auto-load budget on touch devices.

**Files:**
- Modify: `src/components/modals/splatPickerViewModel.ts`
- Test: `src/components/modals/splatPickerViewModel.test.ts`
- Modify: `src/components/modals/SplatPickerModal.tsx`
- Modify: `src/components/modals/useSplatPickerStoreFacade.ts` (expose `touchMode` from the UI store)

**Interfaces:**
- `SplatPickerItem` gains `warning: string | null`.
- `getSplatPickerItems(sources, options?: { warnAboveBytes?: number | null })` — `warning` is `"may exceed this device's memory"` when `options.warnAboveBytes` is a number and `source.size > warnAboveBytes`, else null.
- Modal passes `warnAboveBytes: touchMode ? SPLAT_AUTO_LOAD_MAX_BYTES_TOUCH : null` (import the constant from `../../hooks/urlLoaderPolicy`).
- Facade produces `touchMode: boolean` alongside its existing fields (read from `useUIStore`, matching how other facades expose it).

- [ ] **Step 1: Write the failing tests** (append to `splatPickerViewModel.test.ts`)

```ts
describe('splat picker device-memory warning', () => {
  const sources = [
    { id: 'a', path: 'splats/huge.ply', url: 'u', size: 1_040_000_634 },
    { id: 'b', path: 'splats/small.spz', url: 'u', size: 40_000_000 },
  ];

  it('flags items above the budget when a budget is given', () => {
    const items = getSplatPickerItems(sources, { warnAboveBytes: 50_000_000 });
    expect(items[0].warning).toBe("may exceed this device's memory");
    expect(items[1].warning).toBeNull();
  });

  it('never flags without a budget (desktop)', () => {
    for (const item of getSplatPickerItems(sources)) {
      expect(item.warning).toBeNull();
    }
  });
});
```

Also update the existing `getSplatPickerItems` expectation to include `warning: null` on both rows.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/modals/splatPickerViewModel.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`splatPickerViewModel.ts`:

```ts
export interface SplatPickerItem {
  id: string;
  name: string;
  sizeLabel: string;
  warning: string | null;
}

export const SPLAT_PICKER_WARNING_CLASS = 'flex-shrink-0 text-ds-warning text-xs';

export function getSplatPickerItems(
  sources: readonly SplatFileSource[],
  options: { warnAboveBytes?: number | null } = {}
): SplatPickerItem[] {
  const { warnAboveBytes = null } = options;
  return sources.map((source) => ({
    id: source.id,
    name: source.path.split('/').pop() || source.path,
    sizeLabel: formatSplatSize(source.size),
    warning:
      warnAboveBytes !== null && (source.size ?? 0) > warnAboveBytes
        ? "may exceed this device's memory"
        : null,
  }));
}
```

`useSplatPickerStoreFacade.ts`: expose `touchMode` from `useUIStore` next to the existing fields (follow the file's existing selector style).

`SplatPickerModal.tsx`:
- `const items = getSplatPickerItems(splatFileSources, { warnAboveBytes: touchMode ? SPLAT_AUTO_LOAD_MAX_BYTES_TOUCH : null });`
- Row rendering: after the size label span, add
  ```tsx
  {item.warning && <span className={SPLAT_PICKER_WARNING_CLASS}>{item.warning}</span>}
  ```
- Imports: `SPLAT_AUTO_LOAD_MAX_BYTES_TOUCH` from `../../hooks/urlLoaderPolicy`, `SPLAT_PICKER_WARNING_CLASS` from the view model; `touchMode` from the facade.
- Check `text-ds-warning` exists in `src/index.css` (it is used by Scene3DErrorBoundary); if the class is absent, use `text-ds-muted` instead and note it in the commit.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/modals/splatPickerViewModel.test.ts src/components/modals/useSplatPickerStoreFacade.test.ts`
Expected: PASS (update the facade test to cover `touchMode` if the file asserts the full facade shape).

- [ ] **Step 5: Commit**

```bash
git add src/components/modals/splatPickerViewModel.ts src/components/modals/splatPickerViewModel.test.ts src/components/modals/SplatPickerModal.tsx src/components/modals/useSplatPickerStoreFacade.ts src/components/modals/useSplatPickerStoreFacade.test.ts
git commit -m "feat(viewer): warn in the splat picker when a splat exceeds the device budget"
```

---

### Task 9: Phone-width windows get touch mode at startup

At phone widths on non-touch devices, DropZone shows the touch landing panel while AppLayout/ViewerControls render desktop chrome behind it (clipped, mixed). Root cause: DropZone keys on `useIsMobile()` (1080px) while everything else keys on the store's `touchMode`. Make the store's `touchMode` the single source of truth: enable it at startup for phone-narrow viewports (< `TOUCH_BREAKPOINTS.phone` = 640), and drop DropZone's separate width check.

**Files:**
- Modify: `src/appStartupPolicy.ts`
- Test: `src/appStartupPolicy.test.ts` (extend; the suite exists — `APP_TOUCH_AUTO_LOG_MESSAGE` etc. are tested there)
- Modify: `src/App.tsx`
- Modify: `src/components/dropzone/DropZone.tsx`
- Test: `src/components/dropzone/DropZonePanels.test.tsx` only if it asserts the width-based switching (adapt), otherwise none.

**Interfaces:**
- `getTouchModeAutoAction(isTouchDevice: boolean, isPhoneViewport: boolean): TouchModeStartupAction | null` — returns the enable action when either flag is true. Log message stays `APP_TOUCH_AUTO_LOG_MESSAGE` for touch devices; for phone-width-only, message is `'[App] Touch mode enabled (phone-width viewport)'` (export as `APP_TOUCH_PHONE_WIDTH_LOG_MESSAGE`).
- URL override `?touch=0/1` continues to win (it is checked first in App.tsx).
- DropZone: delete the `useIsMobile` import/usage; panel conditions become `!touchMode` (desktop panel) and `touchMode` (touch panel).

- [ ] **Step 1: Write the failing tests** (append to `appStartupPolicy.test.ts`)

```ts
describe('getTouchModeAutoAction', () => {
  it('enables touch mode for touch devices', () => {
    expect(getTouchModeAutoAction(true, false)).toEqual({
      enabled: true,
      source: 'auto',
      logMessage: APP_TOUCH_AUTO_LOG_MESSAGE,
    });
  });

  it('enables touch mode for phone-width viewports on non-touch devices', () => {
    expect(getTouchModeAutoAction(false, true)).toEqual({
      enabled: true,
      source: 'auto',
      logMessage: APP_TOUCH_PHONE_WIDTH_LOG_MESSAGE,
    });
  });

  it('returns null for wide non-touch environments', () => {
    expect(getTouchModeAutoAction(false, false)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/appStartupPolicy.test.ts`
Expected: FAIL — new export missing / arity mismatch.

- [ ] **Step 3: Implement**

`appStartupPolicy.ts`:

```ts
export const APP_TOUCH_PHONE_WIDTH_LOG_MESSAGE = '[App] Touch mode enabled (phone-width viewport)';

export function getTouchModeAutoAction(
  isTouchDevice: boolean,
  isPhoneViewport: boolean
): TouchModeStartupAction | null {
  if (!isTouchDevice && !isPhoneViewport) return null;

  return {
    enabled: true,
    source: 'auto',
    logMessage: isTouchDevice ? APP_TOUCH_AUTO_LOG_MESSAGE : APP_TOUCH_PHONE_WIDTH_LOG_MESSAGE,
  };
}
```

`App.tsx` line 62 becomes:

```ts
    const isPhoneViewport = window.innerWidth < TOUCH_BREAKPOINTS.phone;
    const touchAction = getTouchModeUrlActionFromSearch(search)
      ?? getTouchModeAutoAction(detectTouchDevice(), isPhoneViewport);
```

with `import { TOUCH_BREAKPOINTS } from './theme/sizing';`.

`DropZone.tsx`: remove `useIsMobile` import and the `const isMobile = useIsMobile();` line; change the two panel conditions:
- desktop panel: `!reconstruction && !urlLoading && !hasUrlLoadRequest && !isDragOver && !isPanelDismissed && !touchMode`
- touch panel: `!reconstruction && !urlLoading && !hasUrlLoadRequest && !isPanelDismissed && touchMode`

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/appStartupPolicy.test.ts src/components/dropzone/DropZonePanels.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/appStartupPolicy.ts src/appStartupPolicy.test.ts src/App.tsx src/components/dropzone/DropZone.tsx
git commit -m "fix(app): phone-width viewports enter touch mode at startup; single source of truth for the landing panel"
```

---

### Task 10: Safe-area insets for notched phones

**Files:**
- Modify: `index.html`
- Modify: `src/index.css`
- Modify: `src/components/layout/appLayoutPolicy.ts` (+ test `appLayoutPolicy.test.ts`)
- Modify: `src/components/layout/AppLayout.tsx`

**Interfaces:**
- Produces: `TOUCH_LAYOUT_ROOT_CLASS` exported from `appLayoutPolicy.ts`; `AppLayout` uses it for the touch-layout root div.

- [ ] **Step 1: Write the failing test** (append to `appLayoutPolicy.test.ts`)

```ts
describe('TOUCH_LAYOUT_ROOT_CLASS', () => {
  it('pins page containment and notch safe-area handling on the touch shell', () => {
    expect(TOUCH_LAYOUT_ROOT_CLASS).toContain('touch-none');
    expect(TOUCH_LAYOUT_ROOT_CLASS).toContain('safe-area-inset');
    expect(TOUCH_LAYOUT_ROOT_CLASS).toContain('h-screen');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/layout/appLayoutPolicy.test.ts`
Expected: FAIL — constant not exported.

- [ ] **Step 3: Implement**

`appLayoutPolicy.ts`:

```ts
/**
 * Touch-layout shell classes. `safe-area-inset` pads the UI clear of notches
 * and the home indicator (requires viewport-fit=cover in index.html);
 * `touch-none` disables browser gestures inside the app shell.
 */
export const TOUCH_LAYOUT_ROOT_CLASS = 'h-screen flex flex-col bg-ds-primary touch-none safe-area-inset';
```

`AppLayout.tsx` line 152: `<div className={TOUCH_LAYOUT_ROOT_CLASS} data-touch-mode="true">` (import the constant from `./appLayoutPolicy`).

`src/index.css`, next to the `.touch-none` utility (line ~1173):

```css
.safe-area-inset { padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
```

`index.html` viewport meta:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/layout/appLayoutPolicy.test.ts src/components/layout/useAppLayoutStoreFacade.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html src/index.css src/components/layout/appLayoutPolicy.ts src/components/layout/appLayoutPolicy.test.ts src/components/layout/AppLayout.tsx
git commit -m "feat(layout): safe-area insets for notched phones in touch mode"
```

---

### Task 11: Full gates, manual smoke check, release v0.9.4

- [ ] **Step 1: Full test suite**

Run: `npm run test:run`
Expected: all pass (baseline was 453 files / 2914 tests before this plan).

- [ ] **Step 2: Lint + build**

Run: `npm run lint && npm run build`
Expected: clean; build succeeds (`tsc -b` runs inside `npm run build`).

- [ ] **Step 3: Manual smoke check on the production build**

```bash
npx vite preview --port 4173 --strictPort
```

In a browser (or the gstack headless browser):
1. `http://localhost:4173/?url=https://huggingface.co/datasets/Jamesbass/bigsur-360-colmap/resolve/main` — console shows the 150 MB skip log, splat picker opens, network has NO full-body `bigsur_v2.ply` fetch (only the 64KB `bytes=0-65535` classification probe).
2. Same URL with `&touch=1` — the "Large dataset (253 MB …)" warning notification appears and the picker's PLY row shows "may exceed this device's memory".
3. Reload the tab mid-download, then load the URL again — the "Reload this dataset?" confirmation appears (sessionStorage record left behind), and confirming proceeds.
4. Narrow the window below 640px and reload without `touch` params — the touch landing panel appears with touch chrome (no desktop toolbar behind it).

- [ ] **Step 4: Version bump + tag + push** (per the release process in CLAUDE.md)

```bash
# edit package.json: "version": "0.9.4"
git add package.json
git commit -m "Bump version to 0.9.4"
git tag v0.9.4
git push origin main --tags
```

- [ ] **Step 5: Watch the deploy**

Run: `gh run watch` (pages-build's serve step occasionally flakes — `gh run rerun` if so), then verify `https://colmapview.github.io/latest/` serves 0.9.4 and repeat smoke check #1 against it.

---

## Self-Review Notes

- Every reported gap maps to a task: frustum long-press (2-5), crash loop (6), oversized-download warnings (7-8), mixed layout (9), safe areas (10), ship (11). Deferred items are listed as explicit non-goals.
- Type consistency: `FrustumLongPressHandle` (Task 3) is consumed with the same shape in Tasks 4-5; `setActiveSceneTouchPointerCount`/`isSingleActiveSceneTouchPointer` (Task 2) match Task 3's fire gate; `getTouchModeAutoAction`'s new two-argument signature (Task 9) is updated at its only call site (App.tsx).
- Ordering constraint: Task 2 must land before Tasks 3-5 (the fire gate imports it). Tasks 6-10 are independent of 2-5 and of each other.
